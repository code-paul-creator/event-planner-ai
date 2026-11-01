# Event Planner AI

A GenAI planning assistant for **weddings, birthdays and community events**. Enter the event type, date, guest count, budget and preferences, and Gemini drafts a personalised plan:

- **Budget** split by category, with exact amounts that always add up to your total
- **Timeline** with real due dates and a tick-off checklist
- **Vendor checklist** with priorities and questions to ask
- **Ideas and tips** tailored to your theme, location and needs

Built with Next.js (App Router), TypeScript, Zod and the Gemini API. Ready to deploy on Vercel.

## Quick start

```bash
npm install
cp .env.example .env.local   # then paste your key into GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

Get a key at <https://aistudio.google.com/apikey>.

| Script | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run check` | Typecheck + lint + tests (what CI runs) |
| `npm test` | Unit, API and accessibility tests |
| `npm run build` | Production build |

## Deploy to GitHub + Vercel

1. Push this folder to a GitHub repo. `.env*` files are git-ignored, so your key is never committed.
2. In Vercel choose **Add New > Project** and import the repo (framework is detected automatically).
3. Under **Settings > Environment Variables** add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) for Production and Preview. **Do not** prefix it with `NEXT_PUBLIC_`, or it would be exposed to browsers.
4. Deploy. GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, lint, tests, build and a dependency audit on every push and PR.

## How it works

```
Browser form -> POST /api/plan -> validate (Zod) -> rate limit -> Gemini (JSON schema)
                                                    |
              plan view <- compose: exact budget math + real dates <- validate output (Zod)
```

The key design choice: **the model is only asked for creative content** (weights, tasks, ideas, questions). Anything that must be correct is computed in code:

- Budget percentages are normalised and split in integer minor units (largest-remainder method), so amounts always sum exactly to the budget.
- Timeline tasks come back as "N days before", and the server turns them into calendar dates. Tasks whose ideal date has already passed are pulled to today and flagged urgent.

## How it maps to the evaluation criteria

| Criterion | What's in the project |
| --- | --- |
| **Problem statement alignment** | Covers all three event types and all four requested outputs (budgets, timelines, vendor checklists, personalised ideas). Preferences, location, guest count and days remaining shape the prompt. Print/PDF export for sharing. |
| **Code quality** | Strict TypeScript (`noUncheckedIndexedAccess`), small single-purpose modules in `src/lib`, one Zod schema as the source of truth for input and model output, ESLint with Next rules, CI on Node 20 and 22. |
| **Security** | API key is server-only and sent in a header, never in a URL or the client bundle. Strict input schema (unknown keys rejected, length and range limits, 8 KB body cap). Prompt-injection hardening: user text is sanitised, embedded as JSON data, and the system prompt tells the model to treat it as data. Model output is schema-validated and rendered as plain text by React (no `dangerouslySetInnerHTML`). Same-origin check, per-IP rate limit, generic client errors with details logged server-side only, CSP and other security headers, `no-store` responses. |
| **Efficiency** | One Gemini call per plan using a fast model with structured JSON output, capped `maxOutputTokens`, a 25 s time budget and a single retry on transient errors. Deterministic work (math, dates) never costs tokens. Client cancels in-flight requests. |
| **Testing** | Vitest suites for budget math, timeline dates, validation, prompt-injection handling, rate limiting, the Gemini client (retries, blocks, bad output), the API route (status codes, no leaks) and axe-core accessibility checks on the form, error state and plan view. |
| **Accessibility** | Semantic landmarks and heading order, skip link, every control labelled, `fieldset`/`legend` for event type, errors linked with `aria-describedby` and summarised in a focused `role="alert"`, polite live regions for progress, focus moved to the results, real table with headers, 44 px touch targets, visible focus rings, light and dark themes, reduced-motion support, print stylesheet. |

## Configuration

| Variable | Required | Default |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes | none |
| `GEMINI_MODEL` | no | `gemini-2.5-flash` |

## Known limitations and next steps

- **Rate limiting is in-memory.** It stops a single client hammering one serverless instance, but instances don't share memory. For a strict global limit, enable Vercel's WAF rate limiting or back `src/lib/rateLimit.ts` with Upstash Redis.
- Plans are not saved. Adding accounts and a database (for example Vercel Postgres) would allow saving and sharing plans.
- The checklist progress resets on refresh; persisting it would need storage.
- AI output can be wrong. The footer reminds users to verify prices and availability with vendors.
