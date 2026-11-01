"use client";

import { useEffect, useRef, useState } from "react";
import type { Plan } from "@/lib/plan";
import { CURRENCIES, EVENT_TYPES, LIMITS } from "@/lib/schema";
import { PlanView } from "./PlanView";

type FieldErrors = Record<string, string>;
type Status = "idle" | "loading" | "error" | "success";

const EVENT_LABELS: Record<(typeof EVENT_TYPES)[number], string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  community: "Community event",
};

const INITIAL = {
  eventType: "wedding",
  title: "",
  date: "",
  guestCount: "",
  budget: "",
  currency: "INR",
  location: "",
  preferences: "",
};

export function validate(values: typeof INITIAL, minDate: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.title.trim()) errors.title = "Give your event a name.";
  if (!values.date) errors.date = "Choose the event date.";
  else if (minDate && values.date < minDate) errors.date = "Choose today or a future date.";
  const guests = Number(values.guestCount);
  if (!values.guestCount || !Number.isInteger(guests) || guests < 1 || guests > LIMITS.maxGuests) {
    errors.guestCount = `Enter a whole number from 1 to ${LIMITS.maxGuests}.`;
  }
  const budget = Number(values.budget);
  if (!values.budget || !Number.isFinite(budget) || budget <= 0) {
    errors.budget = "Enter a budget greater than 0.";
  }
  return errors;
}

export function PlannerApp() {
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [minDate, setMinDate] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  // Computed after mount so server and client markup match (no hydration mismatch).
  useEffect(() => {
    setMinDate(new Date().toLocaleDateString("sv-SE"));
    return () => abortRef.current?.abort();
  }, []);

  // Move focus to the results / error summary so keyboard and screen-reader users land on them.
  useEffect(() => {
    if (status === "success") resultsRef.current?.focus();
  }, [status]);
  useEffect(() => {
    if (status === "error" || Object.keys(errors).length > 0) errorSummaryRef.current?.focus();
  }, [status, errors]);

  function update(field: keyof typeof INITIAL, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "loading") return;

    const found = validate(values, minDate);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setStatus("idle");
      setMessage("");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          eventType: values.eventType,
          title: values.title,
          date: values.date,
          guestCount: Number(values.guestCount),
          budget: Number(values.budget),
          currency: values.currency,
          location: values.location,
          preferences: values.preferences,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        plan?: Plan;
        error?: string;
        fields?: Array<{ field: string; message: string }>;
      };

      if (!response.ok || !data.plan) {
        if (data.fields?.length) {
          setErrors(Object.fromEntries(data.fields.map((f) => [f.field, f.message])));
        }
        setMessage(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setPlan(data.plan);
      setStatus("success");
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setMessage("Network problem. Check your connection and try again.");
      setStatus("error");
    }
  }

  const errorEntries = Object.entries(errors);
  const loading = status === "loading";

  return (
    <div className="container">
      <section aria-labelledby="intro-heading" className="intro">
        <h1 id="intro-heading">Plan your event in minutes</h1>
        <p>
          Tell us about your wedding, birthday or community event. We&apos;ll draft a budget,
          timeline, vendor checklist and ideas tailored to you.
        </p>
      </section>

      <form onSubmit={onSubmit} noValidate aria-busy={loading} className="card">
        {(errorEntries.length > 0 || (status === "error" && message)) && (
          <div ref={errorSummaryRef} tabIndex={-1} role="alert" className="error-summary">
            <p className="error-title">{message || "Please fix the following:"}</p>
            {errorEntries.length > 0 && (
              <ul>
                {errorEntries.map(([field, text]) => (
                  <li key={field}>
                    <a href={`#${field}`}>{text}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <fieldset>
          <legend>Event type</legend>
          <div className="radio-row">
            {EVENT_TYPES.map((type) => (
              <label key={type} className="radio">
                <input
                  type="radio"
                  name="eventType"
                  value={type}
                  checked={values.eventType === type}
                  onChange={() => update("eventType", type)}
                />
                <span>{EVENT_LABELS[type]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="title">Event name</label>
          <input
            id="title"
            name="title"
            type="text"
            maxLength={LIMITS.title}
            value={values.title}
            onChange={(e) => update("title", e.target.value)}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "title-error" : undefined}
            placeholder="e.g. Aarav & Meera's wedding"
            required
          />
          {errors.title && (
            <p id="title-error" className="field-error">
              {errors.title}
            </p>
          )}
        </div>

        <div className="grid">
          <div className="field">
            <label htmlFor="date">Event date</label>
            <input
              id="date"
              name="date"
              type="date"
              min={minDate || undefined}
              value={values.date}
              onChange={(e) => update("date", e.target.value)}
              aria-invalid={Boolean(errors.date)}
              aria-describedby={errors.date ? "date-error" : undefined}
              required
            />
            {errors.date && (
              <p id="date-error" className="field-error">
                {errors.date}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="guestCount">Number of guests</label>
            <input
              id="guestCount"
              name="guestCount"
              type="number"
              inputMode="numeric"
              min={1}
              max={LIMITS.maxGuests}
              value={values.guestCount}
              onChange={(e) => update("guestCount", e.target.value)}
              aria-invalid={Boolean(errors.guestCount)}
              aria-describedby={errors.guestCount ? "guestCount-error" : undefined}
              required
            />
            {errors.guestCount && (
              <p id="guestCount-error" className="field-error">
                {errors.guestCount}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="budget">Total budget</label>
            <input
              id="budget"
              name="budget"
              type="number"
              inputMode="decimal"
              min={1}
              step="any"
              value={values.budget}
              onChange={(e) => update("budget", e.target.value)}
              aria-invalid={Boolean(errors.budget)}
              aria-describedby={errors.budget ? "budget-error" : undefined}
              required
            />
            {errors.budget && (
              <p id="budget-error" className="field-error">
                {errors.budget}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="currency">Currency</label>
            <select
              id="currency"
              name="currency"
              value={values.currency}
              onChange={(e) => update("currency", e.target.value)}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="location">
            City or area <span className="optional">(optional)</span>
          </label>
          <input
            id="location"
            name="location"
            type="text"
            maxLength={LIMITS.location}
            value={values.location}
            onChange={(e) => update("location", e.target.value)}
            placeholder="e.g. Pune"
          />
        </div>

        <div className="field">
          <label htmlFor="preferences">
            Preferences, theme or special needs <span className="optional">(optional)</span>
          </label>
          <textarea
            id="preferences"
            name="preferences"
            rows={4}
            maxLength={LIMITS.preferences}
            value={values.preferences}
            onChange={(e) => update("preferences", e.target.value)}
            aria-describedby="preferences-hint"
            placeholder="Vegetarian menu, outdoor venue, wheelchair access, traditional music..."
          />
          <p id="preferences-hint" className="hint">
            {values.preferences.length} / {LIMITS.preferences} characters
          </p>
        </div>

        <button type="submit" className="button" disabled={loading}>
          {loading ? "Planning..." : "Create my plan"}
        </button>
      </form>

      <div role="status" aria-live="polite" className="status">
        {loading && "Creating your plan. This usually takes 10 to 20 seconds."}
        {status === "success" && "Your plan is ready."}
      </div>

      {plan && status !== "loading" && <PlanView plan={plan} headingRef={resultsRef} />}
    </div>
  );
}
