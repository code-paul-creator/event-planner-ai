import { addDays, toIso } from "@/lib/dates";
import type { PlanAi, PlanRequest } from "@/lib/schema";

export function validRequest(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return {
    eventType: "wedding",
    title: "Aarav & Meera's wedding",
    date: toIso(addDays(new Date(), 30)),
    guestCount: 100,
    budget: 500000,
    currency: "INR",
    location: "Pune",
    preferences: "Vegetarian menu, outdoor venue",
    ...overrides,
  };
}

export const aiFixture: PlanAi = {
  summary: "A warm outdoor wedding for 100 guests with a vegetarian menu.",
  budgetAllocation: [
    { category: "Venue", percent: 35, notes: "Outdoor lawn or garden." },
    { category: "Catering", percent: 40, notes: "Vegetarian menu." },
    { category: "Decor", percent: 15, notes: "Seasonal flowers." },
    { category: "Contingency", percent: 10, notes: "Buffer for surprises." },
  ],
  timeline: [
    { daysBefore: 25, task: "Book venue", details: "Confirm date and deposit." },
    { daysBefore: 14, task: "Finalise menu", details: "Tasting with caterer." },
    { daysBefore: 1, task: "Final walkthrough", details: "Check layout and power." },
  ],
  vendorChecklist: [
    {
      vendor: "Caterer",
      priority: "high",
      questions: ["Can you do a fully vegetarian menu?", "What is the cancellation policy?"],
    },
    { vendor: "Decorator", priority: "medium", questions: ["What flowers are in season?"] },
  ],
  ideas: [
    { title: "Lantern walkway", description: "Warm lanterns lining the entrance." },
    { title: "Live acoustic set", description: "A soft playlist during dinner." },
    { title: "Memory table", description: "Photos of both families." },
  ],
  tips: ["Share the schedule with vendors a week ahead."],
};
