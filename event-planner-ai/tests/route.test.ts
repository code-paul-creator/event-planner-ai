import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/plan/route";
import { GeminiError, generatePlan } from "@/lib/gemini";
import { aiFixture, validRequest } from "./fixtures";

vi.mock("@/lib/gemini", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/gemini")>();
  return { ...original, generatePlan: vi.fn() };
});

const mockedGenerate = vi.mocked(generatePlan);
let counter = 0;

function call(body: unknown, headers: Record<string, string> = {}, ip?: string) {
  counter += 1;
  return POST(
    new Request("http://localhost/api/plan", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip ?? `10.0.0.${counter}`,
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  mockedGenerate.mockResolvedValue(aiFixture);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/plan", () => {
  it("returns a composed plan and forbids caching", async () => {
    const response = await call(validRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { plan } = await response.json();
    expect(plan.budget.lines).toHaveLength(4);
    expect(plan.timeline[0].dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects non-JSON content types", async () => {
    const response = await call("hi", { "content-type": "text/plain" });
    expect(response.status).toBe(415);
  });

  it("rejects malformed JSON", async () => {
    expect((await call("{nope")).status).toBe(400);
  });

  it("reports which fields failed validation", async () => {
    const response = await call({ ...validRequest(), budget: -5 });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.fields.map((f: { field: string }) => f.field)).toContain("budget");
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies", async () => {
    const response = await call(JSON.stringify({ filler: "x".repeat(9000) }));
    expect(response.status).toBe(413);
  });

  it("rejects cross-origin browser requests", async () => {
    const response = await call(validRequest(), { origin: "https://evil.example" });
    expect(response.status).toBe(403);
  });

  it("accepts same-origin browser requests", async () => {
    const response = await call(validRequest(), { origin: "http://localhost" });
    expect(response.status).toBe(200);
  });

  it("rate limits repeated calls from one client", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 9; i++) statuses.push((await call("{}", {}, "9.9.9.9")).status);
    expect(statuses.slice(0, 8).every((s) => s === 400)).toBe(true);
    expect(statuses[8]).toBe(429);
  });

  it.each([
    ["config", 503],
    ["blocked", 422],
    ["timeout", 504],
    ["upstream", 502],
    ["invalid", 502],
  ] as const)("maps %s failures to HTTP %i without leaking details", async (kind, status) => {
    mockedGenerate.mockRejectedValue(new GeminiError("secret internal detail", kind));
    const response = await call(validRequest());
    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain("secret internal detail");
  });
});
