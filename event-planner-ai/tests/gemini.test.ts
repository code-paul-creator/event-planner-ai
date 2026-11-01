import { describe, expect, it, vi } from "vitest";
import { GeminiError, generatePlan } from "@/lib/gemini";
import { aiFixture, validRequest } from "./fixtures";

const ok = (text: string, extra: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text }] }, ...extra }] }),
    { status: 200 },
  );

const base = { apiKey: "test-key", retryDelayMs: 0 };

async function kindOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(GeminiError);
    return (error as GeminiError).kind;
  }
  return "none";
}

describe("generatePlan", () => {
  it("returns validated output and sends the key in a header, not the URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(JSON.stringify(aiFixture)));
    const result = await generatePlan(validRequest(), 30, { ...base, fetchImpl });

    expect(result.summary).toBe(aiFixture.summary);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.systemInstruction.parts[0].text).toContain("DATA");
  });

  it("fails fast with a config error when the key is missing", async () => {
    const fetchImpl = vi.fn();
    expect(await kindOf(generatePlan(validRequest(), 30, { apiKey: "", fetchImpl }))).toBe("config");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("retries once on a transient error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(ok(JSON.stringify(aiFixture)));
    await generatePlan(validRequest(), 30, { ...base, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after two failed attempts", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response("busy", { status: 503 }));
    expect(await kindOf(generatePlan(validRequest(), 30, { ...base, fetchImpl }))).toBe("upstream");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("bad key", { status: 403 }));
    expect(await kindOf(generatePlan(validRequest(), 30, { ...base, fetchImpl }))).toBe("upstream");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps network failures to upstream errors", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    expect(await kindOf(generatePlan(validRequest(), 30, { ...base, fetchImpl }))).toBe("upstream");
  });

  it("maps safety blocks", async () => {
    const blocked = new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }));
    const fetchImpl = vi.fn().mockResolvedValue(blocked);
    expect(await kindOf(generatePlan(validRequest(), 30, { ...base, fetchImpl }))).toBe("blocked");
  });

  it.each([
    ["non-JSON text", ok("not json")],
    ["wrong shape", ok(JSON.stringify({ summary: "only a summary" }))],
    ["truncated output", ok("{}", { finishReason: "MAX_TOKENS" })],
  ])("rejects %s as invalid", async (_name, response) => {
    const fetchImpl = vi.fn().mockResolvedValue(response);
    expect(await kindOf(generatePlan(validRequest(), 30, { ...base, fetchImpl }))).toBe("invalid");
  });
});
