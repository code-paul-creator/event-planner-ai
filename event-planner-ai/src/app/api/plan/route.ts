import { daysUntil, composePlan } from "@/lib/plan";
import { GeminiError, generatePlan } from "@/lib/gemini";
import { createRateLimiter } from "@/lib/rateLimit";
import { planRequestSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BODY_BYTES = 8 * 1024;
const limiter = createRateLimiter({ limit: 8, windowMs: 60_000 });

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/** Blocks cross-site browser requests. Requests with no Origin (curl, server-to-server) fall through to the rate limiter. */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return json({ error: "Forbidden." }, 403);

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ error: "Content-Type must be application/json." }, 415);
  }

  const limit = limiter.check(clientIp(request));
  if (!limit.allowed) {
    return json(
      { error: "Too many requests. Please wait a moment and try again." },
      429,
      { "Retry-After": String(limit.retryAfterSec) },
    );
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return json({ error: "Request is too large." }, 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const parsed = planRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return json(
      {
        error: "Please check the highlighted fields.",
        fields: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  const now = new Date();
  try {
    const ai = await generatePlan(parsed.data, daysUntil(parsed.data.date, now));
    return json({ plan: composePlan(ai, parsed.data, now) });
  } catch (error) {
    // Log the real cause server-side only; never leak upstream details to the client.
    const kind = error instanceof GeminiError ? error.kind : "unknown";
    console.error("[plan] generation failed:", kind, error instanceof Error ? error.message : "");

    switch (kind) {
      case "config":
        return json({ error: "The planner is not configured yet. Please try again later." }, 503);
      case "blocked":
        return json(
          { error: "We couldn't plan that request. Try rewording your preferences." },
          422,
        );
      case "timeout":
        return json({ error: "The planner took too long. Please try again." }, 504);
      default:
        return json({ error: "The planner is unavailable right now. Please try again." }, 502);
    }
  }
}
