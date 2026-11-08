/** Catch common vague date requests without guessing a time period. */
export function initialRuleQuestion(instruction: string): string | null {
  if (/\bolder\s+than\s*[?.!]*$/i.test(instruction)) return "Which date range do you mean? How many days, weeks, months, or years old should the files be?";
  const vague = /\b(?:old|recent|recently)\b/i.test(instruction);
  const hasPeriod = /\b(?:today|yesterday|day|days|week|weeks|month|months|year|years|all dates|any time)\b/i.test(instruction);
  return vague && !hasPeriod ? "Which date range do you mean? Tidy can include all dates, files modified within a recent period, or files older than a cutoff." : null;
}
