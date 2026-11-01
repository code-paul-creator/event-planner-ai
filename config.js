// Where the front end sends requests.
// - Hosted on Vercel together with /api: leave as "/api/plan".
// - HTML hosted on GitHub Pages and API on Vercel: use the full URL, e.g.
//   "https://your-project.vercel.app/api/plan" (and set ALLOWED_ORIGINS on Vercel).
window.PLANNER_CONFIG = { apiUrl: "/api/plan" };
