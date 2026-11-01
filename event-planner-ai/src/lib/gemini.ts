import { buildPrompt } from "./prompt";
import { planAiSchema, type PlanAi, type PlanRequest } from "./schema";

export type GeminiErrorKind = "config" | "upstream" | "blocked" | "invalid" | "timeout";

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly kind: GeminiErrorKind,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export interface GeminiOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  /** Total time budget across all attempts. */
  timeoutMs?: number;
  retryDelayMs?: number;
}

const DEFAULT_MODEL = "gemini-2.5-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const str = { type: "STRING" } as const;

/** Gemini "structured output" schema: forces valid JSON in the shape we validate with zod. */
export const responseSchema = {
  type: "OBJECT",
  properties: {
    summary: str,
    budgetAllocation: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { category: str, percent: { type: "NUMBER" }, notes: str },
        required: ["category", "percent", "notes"],
      },
    },
    timeline: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { daysBefore: { type: "INTEGER" }, task: str, details: str },
        required: ["daysBefore", "task", "details"],
      },
    },
    vendorChecklist: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          vendor: str,
          priority: { type: "STRING", enum: ["high", "medium", "low"] },
          questions: { type: "ARRAY", items: str },
        },
        required: ["vendor", "priority", "questions"],
      },
    },
    ideas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { title: str, description: str },
        required: ["title", "description"],
      },
    },
    tips: { type: "ARRAY", items: str },
  },
  required: ["summary", "budgetAllocation", "timeline", "vendorChecklist", "ideas", "tips"],
} as const;

interface GeminiResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generatePlan(
  req: PlanRequest,
  daysUntilEvent: number,
  options: GeminiOptions = {},
): Promise<PlanAi> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("GEMINI_API_KEY is not configured", "config");

  const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const doFetch = options.fetchImpl ?? fetch;
  const retryDelay = options.retryDelayMs ?? 600;
  const signal = AbortSignal.timeout(options.timeoutMs ?? 25_000);
  const { systemInstruction, userText } = buildPrompt(req, daysUntilEvent);

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 6144,
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  let response: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // The key goes in a header, not the URL, so it never lands in logs.
      response = await doFetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw new GeminiError("Gemini request timed out", "timeout");
      throw new GeminiError(`Gemini request failed: ${(error as Error).name}`, "upstream");
    }
    if (response.ok || !RETRYABLE.has(response.status) || attempt === 1) break;
    await sleep(retryDelay);
  }

  if (!response || !response.ok) {
    throw new GeminiError(`Gemini returned HTTP ${response?.status ?? "unknown"}`, "upstream");
  }

  let data: GeminiResponse;
  try {
    data = (await response.json()) as GeminiResponse;
  } catch {
    throw new GeminiError("Gemini returned a non-JSON response", "invalid");
  }

  if (data.promptFeedback?.blockReason) {
    throw new GeminiError("Request was blocked by Gemini safety filters", "blocked");
  }
  const candidate = data.candidates?.[0];
  if (!candidate || candidate.finishReason === "SAFETY") {
    throw new GeminiError("Gemini returned no usable answer", "blocked");
  }
  if (candidate.finishReason === "MAX_TOKENS") {
    throw new GeminiError("Gemini output was truncated", "invalid");
  }

  const raw = (candidate.content?.parts ?? []).map((part) => part.text ?? "").join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GeminiError("Gemini output was not valid JSON", "invalid");
  }

  const result = planAiSchema.safeParse(parsed);
  if (!result.success) throw new GeminiError("Gemini output failed validation", "invalid");
  return result.data;
}
