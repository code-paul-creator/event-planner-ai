(() => {
  "use strict";

  const API_URL = (window.PLANNER_CONFIG && window.PLANNER_CONFIG.apiUrl) || "/api/plan";
  const MAX_GUESTS = 5000;
  const $ = (id) => document.getElementById(id);

  const form = $("plan-form");
  const submitBtn = $("submit");
  const statusEl = $("status");
  const resultsEl = $("results");
  const errorBox = $("error-summary");
  const errorTitle = $("error-title");
  const errorList = $("error-list");
  const FIELD_IDS = ["title", "date", "guestCount", "budget"];

  let controller = null;

  /* ------------------------------------------------------------- helpers */

  // All dynamic content goes through textContent / text nodes. Never innerHTML,
  // so model output can't inject markup or scripts.
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === false || value == null) continue;
      if (key === "class") node.className = value;
      else node.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children.flat()) {
      if (child !== null && child !== undefined && child !== false) node.append(child);
    }
    return node;
  }

  const money = (amount, currency) =>
    new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);

  const fmtDate = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  };

  /* ---------------------------------------------------------- form state */

  $("date").min = new Date().toLocaleDateString("sv-SE");

  $("preferences").addEventListener("input", (e) => {
    $("preferences-hint").textContent = `${e.target.value.length} / 600 characters`;
  });

  function setFieldError(id, message) {
    const input = $(id);
    const err = $(`${id}-error`);
    if (!input || !err) return;
    if (message) {
      err.textContent = message;
      err.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", `${id}-error`);
    } else {
      err.textContent = "";
      err.hidden = true;
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }

  function clearErrors() {
    FIELD_IDS.forEach((id) => setFieldError(id, ""));
    errorBox.hidden = true;
    errorList.replaceChildren();
    errorTitle.textContent = "";
  }

  function showErrors(title, fieldErrors) {
    FIELD_IDS.forEach((id) => setFieldError(id, ""));
    errorList.replaceChildren();
    for (const { field, message } of fieldErrors) {
      setFieldError(field, message);
      if (FIELD_IDS.includes(field)) {
        errorList.append(h("li", null, h("a", { href: `#${field}` }, message)));
      }
    }
    errorTitle.textContent = title;
    errorBox.hidden = false;
    errorBox.focus();
  }

  function readValues() {
    return {
      eventType: form.elements.eventType.value,
      title: $("title").value.trim(),
      date: $("date").value,
      guestCount: $("guestCount").value === "" ? NaN : Number($("guestCount").value),
      budget: $("budget").value === "" ? NaN : Number($("budget").value),
      currency: $("currency").value,
      location: $("location").value.trim(),
      preferences: $("preferences").value.trim(),
    };
  }

  function validate(v) {
    const errors = [];
    if (!v.title) errors.push({ field: "title", message: "Give your event a name." });
    if (!v.date) errors.push({ field: "date", message: "Choose the event date." });
    else if (v.date < $("date").min) errors.push({ field: "date", message: "Choose today or a future date." });
    if (!Number.isInteger(v.guestCount) || v.guestCount < 1 || v.guestCount > MAX_GUESTS) {
      errors.push({ field: "guestCount", message: `Enter a whole number from 1 to ${MAX_GUESTS}.` });
    }
    if (!Number.isFinite(v.budget) || v.budget <= 0) {
      errors.push({ field: "budget", message: "Enter a budget greater than 0." });
    }
    return errors;
  }

  /* ----------------------------------------------------------- rendering */

  function section(title, id, ...content) {
    return h("section", { class: "card", "aria-labelledby": id }, h("h3", { id }, title), ...content);
  }

  function renderPlan(plan) {
    const { meta, budget } = plan;
    const fmt = (n) => money(n, budget.currency);
    const when = meta.daysUntil <= 0 ? "today" : meta.daysUntil === 1 ? "tomorrow" : `in ${meta.daysUntil} days`;

    const title = h("h2", { id: "plan-title", tabindex: "-1" }, meta.title);

    const budgetTable = h(
      "div",
      { class: "table-wrap", role: "region", "aria-labelledby": "budget-h", tabindex: "0" },
      h(
        "table",
        null,
        h("caption", { class: "visually-hidden" }, "Suggested budget split by category"),
        h(
          "thead",
          null,
          h("tr", null,
            h("th", { scope: "col" }, "Category"),
            h("th", { scope: "col", class: "num" }, "Share"),
            h("th", { scope: "col", class: "num" }, "Amount"),
            h("th", { scope: "col" }, "Notes")),
        ),
        h(
          "tbody",
          null,
          budget.lines.map((line) =>
            h("tr", null,
              h("th", { scope: "row" }, line.category),
              h("td", { class: "num" }, `${line.percent}%`),
              h("td", { class: "num" }, fmt(line.amount)),
              h("td", null, line.notes)),
          ),
        ),
      ),
    );

    const progress = h("p", { class: "hint", "aria-live": "polite" }, `0 of ${plan.timeline.length} tasks done`);
    const checklist = h(
      "ol",
      { class: "checklist" },
      plan.timeline.map((item, i) => {
        const id = `task-${i}`;
        return h(
          "li",
          null,
          h("input", { id, type: "checkbox" }),
          h("label", { for: id },
            h("span", { class: "task-title" }, item.task),
            h("span", { class: "task-date" }, `Due ${fmtDate(item.dueDate)}${item.compressed ? " (urgent: start now)" : ""}`),
            h("span", { class: "task-details" }, item.details)),
        );
      }),
    );
    checklist.addEventListener("change", () => {
      const done = checklist.querySelectorAll("input:checked").length;
      progress.textContent = `${done} of ${plan.timeline.length} tasks done`;
    });

    const vendors = h(
      "ul",
      { class: "vendors" },
      plan.vendors.map((v) =>
        h("li", null,
          h("h4", null, `${v.vendor} `, h("span", { class: `badge badge-${v.priority}` }, `${v.priority} priority`)),
          h("p", { class: "hint" }, "Questions to ask:"),
          h("ul", null, v.questions.map((q) => h("li", null, q)))),
      ),
    );

    const ideas = h(
      "ul",
      { class: "ideas" },
      plan.ideas.map((idea) => h("li", null, h("h4", null, idea.title), h("p", null, idea.description))),
    );

    const printBtn = h("button", { type: "button", class: "button secondary no-print" }, "Print or save as PDF");
    printBtn.addEventListener("click", () => window.print());

    const article = h(
      "article",
      { class: "plan", "aria-labelledby": "plan-title" },
      h("header", { class: "plan-header" },
        title,
        h("p", { class: "meta" },
          `${fmtDate(meta.date)} (${when}) · ${meta.guestCount} guests${meta.location ? ` · ${meta.location}` : ""}`),
        printBtn),
      section("Overview", "summary-h", h("p", null, plan.summary)),
      section("Budget", "budget-h",
        h("p", null, `Total ${fmt(budget.total)} · about ${fmt(budget.perGuest)} per guest`),
        budgetTable),
      section("Timeline", "timeline-h", progress, checklist),
      section("Vendor checklist", "vendors-h", vendors),
      section("Ideas for you", "ideas-h", ideas),
      plan.tips.length ? section("Tips", "tips-h", h("ul", null, plan.tips.map((t) => h("li", null, t)))) : null,
    );

    resultsEl.replaceChildren(article);
    title.focus();
  }

  /* -------------------------------------------------------------- submit */

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? "Planning..." : "Create my plan";
    form.setAttribute("aria-busy", String(loading));
    statusEl.textContent = loading ? "Creating your plan. This usually takes 10 to 20 seconds." : "";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitBtn.disabled) return;

    clearErrors();
    const values = readValues();
    const problems = validate(values);
    if (problems.length) {
      showErrors("Please fix the following:", problems);
      return;
    }

    if (controller) controller.abort();
    controller = new AbortController();
    setLoading(true);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(values),
      });
      let data = {};
      try {
        data = await response.json();
      } catch {
        /* non-JSON error body */
      }

      if (!response.ok || !data.plan) {
        setLoading(false);
        showErrors(data.error || "Something went wrong. Please try again.", Array.isArray(data.fields) ? data.fields : []);
        return;
      }
      setLoading(false);
      renderPlan(data.plan);
      statusEl.textContent = "Your plan is ready.";
    } catch (error) {
      if (error && error.name === "AbortError") return;
      setLoading(false);
      showErrors("Network problem. Check your connection and try again.", []);
    }
  });
})();
