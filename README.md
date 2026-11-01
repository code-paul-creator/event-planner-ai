# Event Planner AI (HTML + Gemini)

Plain HTML, CSS and JavaScript front end with one small serverless function that talks to Gemini. It plans **weddings, birthdays and community events**: budget, timeline with real dates, vendor checklist and personalised ideas.

```
index.html  styles.css  app.js  config.js      <- static front end (no build step)
api/plan.js  api/_lib.js                        <- serverless function that holds your Gemini key
vercel.json                                     <- security headers + function timeout
tests/api.test.js                               <- 34 tests, no dependencies (node --test)
```

## Why the key can't live in GitHub Secrets alone

GitHub Secrets are only readable by GitHub Actions while a job runs. A static page on GitHub Pages runs in the visitor's browser, so any key put into the page, even from a secret, is visible to everyone via View Source. That would let anyone use (and bill) your Gemini key.

So the key lives in the **hosting platform's environment variables** (Vercel), and only the serverless function reads it. The browser never sees it.

## Deploy (recommended): GitHub repo -> Vercel

1. Push this folder to a GitHub repo.
2. In Vercel: **Add New > Project**, import the repo, keep the defaults (no build command needed).
3. **Settings > Environment Variables**, add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) for Production and Preview, then redeploy.
4. Open the Vercel URL. Every push to `main` redeploys automatically.

Get a key at <https://aistudio.google.com/apikey>.

### Optional: HTML on GitHub Pages, API on Vercel

1. Deploy to Vercel as above.
2. In `config.js` set `apiUrl` to `https://YOUR-PROJECT.vercel.app/api/plan`.
3. In Vercel add `ALLOWED_ORIGINS=https://YOUR-USER.github.io` (no trailing slash) and redeploy.
4. In the repo go to **Settings > Pages > Source: GitHub Actions**, then run the *Deploy HTML to GitHub Pages* workflow from the Actions tab.

Note: GitHub Pages can't set security headers, so the strict CSP in `vercel.json` only applies to the Vercel-hosted copy.

## Local testing

```bash
npm test                 # runs the test suite (Node 20+, no install needed)
npx vercel dev           # runs the site and API locally; put GEMINI_API_KEY in .env.local
```

## What's covered

| Criterion | How |
| --- | --- |
| **Problem alignment** | All three event types; budget, timeline, vendor checklist, ideas and tips; preferences, location, guests and days remaining shape the prompt; print or save as PDF. |
| **Code quality** | No dependencies. Pure logic in `api/_lib.js`, thin handler in `api/plan.js`, separate HTML/CSS/JS, comments explain the why. |
| **Security** | Key server-side only and sent in a header. Strict request validation (unknown keys, types, ranges, 8 KB cap). Prompt-injection hardening (sanitised text embedded as JSON data, system rules). Model output validated and clamped. Front end builds the page with `textContent` only (no `innerHTML`). Same-origin or allow-listed CORS, per-IP rate limit, generic error messages, strict CSP and other headers, `no-store`. |
| **Efficiency** | One Gemini call using structured JSON output, a token cap, a 25 s limit, one retry on temporary errors. Budget math and dates are computed in code, not by the model. In-flight requests are cancelled on resubmit. |
| **Testing** | 34 tests: validation, budget sums, timeline dates, prompt injection, rate limiting, Gemini client retries/blocks/bad output, and the HTTP handler (status codes, CORS, no leaks). CI runs them on every push. |
| **Accessibility** | Landmarks, skip link, labelled controls, fieldset/legend, errors linked to fields and announced in a focused alert, live regions for progress, focus moved to results, real table with headers, large touch targets, visible focus, light/dark themes, reduced motion, print styles. |

## Limitations

- The rate limiter is in memory, so it limits per serverless instance. For a strict global limit use Vercel's WAF rate limiting or Upstash Redis.
- The browser UI has not been exercised in a real browser or against the live Gemini API from this workspace. Do a quick manual run after deploying.
- AI output can be wrong; the page tells users to verify prices and availability.
