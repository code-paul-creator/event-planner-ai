import { z } from "zod";
import { addDays, isValidIsoDate, toIso } from "./dates";

export const EVENT_TYPES = ["wedding", "birthday", "community"] as const;
export const CURRENCIES = ["INR", "USD", "EUR", "GBP"] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type Currency = (typeof CURRENCIES)[number];

export const LIMITS = {
  title: 100,
  location: 100,
  preferences: 600,
  maxGuests: 5000,
  maxBudget: 1_000_000_000,
  maxYearsAhead: 5,
} as const;

/** Input contract for POST /api/plan. `.strict()` rejects unknown keys. */
export const planRequestSchema = z
  .object({
    eventType: z.enum(EVENT_TYPES),
    title: z.string().trim().min(1, "Give your event a name.").max(LIMITS.title),
    date: z
      .string()
      .refine(isValidIsoDate, "Enter a valid date.")
      .refine((value) => {
        // Allow "yesterday" in UTC so users east of UTC (e.g. India) planning
        // for today are never rejected by timezone skew.
        const earliest = toIso(addDays(new Date(), -1));
        const latest = toIso(addDays(new Date(), 365 * LIMITS.maxYearsAhead));
        return value >= earliest && value <= latest;
      }, `Choose a date from today up to ${LIMITS.maxYearsAhead} years ahead.`),
    guestCount: z
      .number({ invalid_type_error: "Enter the number of guests." })
      .int("Guests must be a whole number.")
      .min(1, "At least 1 guest.")
      .max(LIMITS.maxGuests, `Up to ${LIMITS.maxGuests} guests.`),
    budget: z
      .number({ invalid_type_error: "Enter your total budget." })
      .positive("Budget must be greater than 0.")
      .max(LIMITS.maxBudget, "Budget is too large."),
    currency: z.enum(CURRENCIES).default("INR"),
    location: z.string().trim().max(LIMITS.location).default(""),
    preferences: z.string().trim().max(LIMITS.preferences).default(""),
  })
  .strict();

export type PlanRequest = z.infer<typeof planRequestSchema>;

/**
 * Shape we require back from Gemini. Bounds are deliberately generous: the
 * goal is to reject garbage/runaway output, not to nitpick wording.
 */
const text = (max: number) => z.string().trim().min(1).max(max);

export const planAiSchema = z.object({
  summary: text(800),
  budgetAllocation: z
    .array(
      z.object({
        category: text(80),
        percent: z.number().min(0).max(100),
        notes: text(400),
      }),
    )
    .min(3)
    .max(14),
  timeline: z
    .array(
      z.object({
        daysBefore: z.number().int().min(0).max(3650),
        task: text(160),
        details: text(500),
      }),
    )
    .min(3)
    .max(30),
  vendorChecklist: z
    .array(
      z.object({
        vendor: text(80),
        priority: z.enum(["high", "medium", "low"]),
        questions: z.array(text(240)).min(1).max(6),
      }),
    )
    .min(2)
    .max(16),
  ideas: z
    .array(z.object({ title: text(100), description: text(500) }))
    .min(3)
    .max(10),
  tips: z.array(text(300)).max(8),
});

export type PlanAi = z.infer<typeof planAiSchema>;
