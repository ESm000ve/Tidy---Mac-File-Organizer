/** One preference shared by the renderer and the filename service. */
export type NamingStyle = "descriptive" | "date-first";
export type RenameEngine = "gemini" | "on-device";

export function renameNeedsReview(source: string | undefined, confidence: string | undefined, nameChanged: boolean): boolean {
  return nameChanged && source !== "local" && source !== "ocr" && (confidence === "medium" || confidence === "low");
}

export function normalizeNamingStyle(value: unknown): NamingStyle {
  return value === "date-first" ? "date-first" : "descriptive";
}

/** Dates come from local file metadata, never a model's guess or today's date. */
export function applyNamingStyle(name: string, style: NamingStyle, modifiedMs?: number): string {
  if (style !== "date-first" || !Number.isFinite(modifiedMs)) return name;
  const date = new Date(modifiedMs!);
  if (Number.isNaN(date.getTime())) return name;
  const stamp = `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const clean = name.replace(/^\d{4}-\d{2}-\d{2}(?:[ _-]+|$)/, "");
  const dot = clean.lastIndexOf(".");
  const extension = dot > 0 ? clean.slice(dot) : "";
  const stem = extension ? clean.slice(0, -extension.length) : clean;
  return `${stamp}_${stem.slice(0, Math.max(1, 255 - stamp.length - 1 - extension.length))}${extension}`;
}
