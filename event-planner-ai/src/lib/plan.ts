import { allocateBudget, type BudgetLine } from "./budget";
import { daysBetween, toIso, toUtcDate } from "./dates";
import type { PlanAi, PlanRequest } from "./schema";
import { buildTimeline, type TimelineItem } from "./timeline";

export interface Plan {
  meta: {
    eventType: PlanRequest["eventType"];
    title: string;
    date: string;
    guestCount: number;
    location: string;
    daysUntil: number;
    generatedAt: string;
  };
  summary: string;
  budget: {
    total: number;
    currency: PlanRequest["currency"];
    perGuest: number;
    lines: BudgetLine[];
  };
  timeline: TimelineItem[];
  vendors: PlanAi["vendorChecklist"];
  ideas: PlanAi["ideas"];
  tips: string[];
}

export function daysUntil(eventDate: string, now: Date): number {
  return daysBetween(toUtcDate(toIso(now)), toUtcDate(eventDate));
}

/** Merges the model's creative output with deterministic, code-computed numbers and dates. */
export function composePlan(ai: PlanAi, req: PlanRequest, now: Date = new Date()): Plan {
  return {
    meta: {
      eventType: req.eventType,
      title: req.title,
      date: req.date,
      guestCount: req.guestCount,
      location: req.location,
      daysUntil: daysUntil(req.date, now),
      generatedAt: now.toISOString(),
    },
    summary: ai.summary,
    budget: {
      total: req.budget,
      currency: req.currency,
      perGuest: Math.round((req.budget / req.guestCount) * 100) / 100,
      lines: allocateBudget(ai.budgetAllocation, req.budget),
    },
    timeline: buildTimeline(ai.timeline, req.date, now),
    vendors: ai.vendorChecklist,
    ideas: ai.ideas,
    tips: ai.tips,
  };
}
