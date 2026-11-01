import { addDays, toIso, toUtcDate } from "./dates";

export interface RawTask {
  daysBefore: number;
  task: string;
  details: string;
}

export interface TimelineItem {
  /** YYYY-MM-DD */
  dueDate: string;
  daysBefore: number;
  task: string;
  details: string;
  /** True when the ideal date had already passed and the task was pulled forward to today. */
  compressed: boolean;
}

/**
 * Converts relative "N days before" tasks into real dates. The model never
 * computes calendar dates itself. Tasks whose ideal date is already in the past
 * are moved to today and flagged so the UI can show they are urgent.
 */
export function buildTimeline(tasks: RawTask[], eventDate: string, now: Date): TimelineItem[] {
  const event = toUtcDate(eventDate);
  const today = toUtcDate(toIso(now));

  return tasks
    .map((task) => {
      const ideal = addDays(event, -task.daysBefore);
      const compressed = ideal.getTime() < today.getTime();
      let due = compressed ? today : ideal;
      if (due.getTime() > event.getTime()) due = event;
      return {
        dueDate: toIso(due),
        daysBefore: task.daysBefore,
        task: task.task,
        details: task.details,
        compressed,
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.daysBefore - a.daysBefore);
}
