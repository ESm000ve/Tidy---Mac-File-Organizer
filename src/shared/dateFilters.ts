export const DATE_FILTER_LABELS = {
  any: "Any time",
  today: "Past 24 hours",
  week: "Past 7 days",
  month: "Past 30 days",
  year: "Past 365 days",
  older: "Older than…",
} as const;

export type DateFilter = keyof typeof DATE_FILTER_LABELS;
export const MAX_OLDER_DAYS = 36500;
export const DEFAULT_OLDER_DAYS = 30;

export function isDateFilter(value: unknown): value is DateFilter {
  return typeof value === "string" && Object.hasOwn(DATE_FILTER_LABELS, value);
}

export function isOlderDays(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_OLDER_DAYS;
}
