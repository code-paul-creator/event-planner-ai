import {
  GeminiError, composePlan, createRateLimiter, daysUntil, generatePlan, validateRequest,
} from "./_lib.js";

const MAX_BODY_BYTES = 8 * 1024;
const limiter = createRateLimiter({ limit: 8, windowMs: 60_000 });

const headerOf = (req, name) => {
  const v = req.headers?.[name];
  return Array.isArray(v) ? v[0] : v;
};

function clientIp(req) {
  return headerOf(req, "x-forwarded-for")?.split(",")[0]?.trim() || headerOf(req, "x-real-ip") || "unknown";
}

/** "Same origin" or an origin listed in ALLOWED_ORIGINS (comma-separated, e.g. your GitHub Pages URL). */
function originStatus(req) {
  const origin = headerOf(req, "origin");
  if (!origin) return { ok: true, cors: null };
  const host = headerOf(req, "x-forwarded-host") || headerOf(req, "host");
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  let sameHost = false;
  try {
    sameHost = new URL(origin).host === host;
  } catch {
    return { ok: false, cors: null };
  }
  if (sameHost) return { ok: true, cors: null };
  if (allowed.includes(origin)) return { ok: true, cors: origin };
  return { ok: false, cors: null };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const origin = originStatus(req);
  if (!origin.ok) return res.status(403).json({ error: "Forbidden." });
  if (origin.cors) {
    res.setHeader("Access-Control-Allow-Origin", origin.cors);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!String(headerOf(req, "content-type") || "").toLowerCase().includes("application/json")) {
    return res.status(415).json({ error: "Content-Type must be application/json." });
  }

  const limit = limiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Request body must be valid JSON." });
    }
  }
  if (Buffer.byteLength(JSON.stringify(body ?? null)) > MAX_BODY_BYTES) {
    return res.status(413).json({ error: "Request is too large." });
  }

  const now = new Date();
  const checked = validateRequest(body, now);
  if (!checked.ok) {
    return res.status(400).json({ error: "Please check the highlighted fields.", fields: checked.errors });
  }

  try {
    const days = daysUntil(checked.value.date, now);
    const ai = await generatePlan(checked.value, days);
    return res.status(200).json({ plan: composePlan(ai, checked.value, now) });
  } catch (error) {
    // Real cause is logged server-side only; the client gets a generic message.
    const kind = error instanceof GeminiError ? error.kind : "unknown";
    console.error("[plan] generation failed:", kind, error instanceof Error ? error.message : "");
    const map = {
      config: [503, "The planner is not configured yet. Please try again later."],
      blocked: [422, "We couldn't plan that request. Try rewording your preferences."],
      timeout: [504, "The planner took too long. Please try again."],
    };
    const [status, message] = map[kind] ?? [502, "The planner is unavailable right now. Please try again."];
    return res.status(status).json({ error: message });
  }
}
