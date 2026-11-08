import { applyCategoryPatch, applyFilterPatch, readPath, type AiRulePatch } from "./aiRules";
import type { OrganizerConfig } from "../types";
import type { NamingStyle } from "../../shared/naming";
import { isDateFilter, isOlderDays } from "../../shared/dateFilters";
export { initialRuleQuestion } from "../../shared/ruleQuestions";

export interface ClarificationTurn { question: string; answer: string }
export interface RuleSummaryRow { label: string; value: string }
export interface RuleDraft {
  config: OrganizerConfig;
  smartRenameEnabled: boolean;
  openPreview: boolean;
  summary: RuleSummaryRow[];
}

export function readRuleResponse(value: unknown): AiRulePatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI returned an invalid rule. Please try rephrasing it.");
  const patch = value as AiRulePatch;
  if (patch.includeSubfolders != null && typeof patch.includeSubfolders !== "boolean") throw new Error("AI returned an invalid subfolder option.");
  if (patch.clarification != null && typeof patch.clarification !== "string") throw new Error("AI returned an invalid clarification. Please try again.");
  return patch;
}

/** Summarize the actual validated settings, rather than an AI-written promise. */
export function prepareRuleDraft(current: OrganizerConfig, renameEnabled: boolean, patch: AiRulePatch, namingStyle: NamingStyle): RuleDraft {
  const date = patch.updateFilters?.dateModified;
  const size = patch.updateFilters?.fileSize;
  if (date != null && !isDateFilter(date)) throw new Error("That date filter is not supported.");
  if (date === "older" && !isOlderDays(patch.updateFilters?.olderThanDays)) throw new Error("An older-than filter needs a valid cutoff in whole days.");
  if (size != null && !["any", "small", "medium", "large"].includes(size)) throw new Error("That file-size filter is not supported. Try small, medium, or large files.");
  const config: OrganizerConfig = {
    ...current,
    includeSubfolders: typeof patch.includeSubfolders === "boolean" ? patch.includeSubfolders : current.includeSubfolders,
    sourcePath: readPath(patch.sourcePath) ?? current.sourcePath,
    destPath: readPath(patch.destPath) ?? current.destPath,
    categories: applyCategoryPatch(current.categories, patch),
    filters: applyFilterPatch(current.filters, patch),
  };
  const smartRenameEnabled = typeof patch.smartRename === "boolean" ? patch.smartRename : renameEnabled;
  // Folder selections belong to one source; a newly chosen source starts at All.
  if (config.sourcePath !== current.sourcePath) config.selectedSourceFolders = null;
  if (JSON.stringify(config) === JSON.stringify(current) && smartRenameEnabled === renameEnabled && patch.execute !== true) throw new Error("No supported changes were found. Try a specific file type, folder, or recent-date range.");
  const enabled = config.categories.filter(category => category.enabled && category.extensions.length);
  const dateLabels = { any: "Any time", today: "Within the past day", week: "Within the past 7 days", month: "Within the past 30 days", year: "Within the past 365 days" };
  const sizeLabels = { any: "Any size", small: "Less than 1 MB", medium: "1–100 MB", large: "More than 100 MB" };
  const conflicts = { rename: "Keep both; append a number", skip: "Skip existing files", overwrite: "Replace existing; keep a backup for Undo", archive: "Archive duplicates; keep both on name conflicts", trash: "Move content duplicates to Trash" };
  const summary: RuleSummaryRow[] = [
    { label: "Files", value: enabled.length ? enabled.map(category => `${category.name} (${category.extensions.map(ext => `.${ext.replace(/^\./, "")}`).join(", ")})`).join("; ") : "No enabled file types" },
    { label: "Source", value: config.sourcePath || "Not selected — choose a folder before running" },
    { label: "File type selection", value: config.includeSubfolders && config.selectedFileExtensions != null ? (config.selectedFileExtensions.map(ext => `.${ext}`).join(", ") || "None; no files will move") : "All enabled file types" },
    { label: "Search inside", value: config.includeSubfolders ? (config.selectedSourceFolders != null ? `${config.selectedSourceFolders.length} selected source folders (each folder separately)` : "Source folder and all subfolders; destination and Tidy Undo backups excluded") : "Source folder only" },
    { label: "Destination", value: config.organizationMode === "tags" ? "Apply Finder tags in the source folder" : config.destPath || "Not selected — choose a folder before running" },
    { label: "Modified", value: config.filters.dateModified === "older"
      ? `Older than ${config.filters.olderThanDays} day(s)`
      : dateLabels[config.filters.dateModified] },
    { label: "File size", value: sizeLabels[config.filters.fileSize] },
    { label: "Dot-files", value: config.filters.excludeHidden ? "Skipped" : "Included if their file type matches" },
    { label: "Name changes", value: smartRenameEnabled ? `Suggestions only; ${namingStyle === "date-first" ? "date first, using each file's last modified date" : "descriptive names"}` : "Keep original names" },
  ];
  const folders = enabled.filter(category => category.subfolders || category.smartCategorization);
  if (folders.length) summary.push({ label: "Subfolders", value: folders.map(category => `${category.name}: ${category.smartCategorization ? "suggested content folders" : "by file extension"}`).join("; ") });
  if (enabled.some(category => category.duplicateDetection)) summary.push({ label: "Duplicates", value: "Compare complete file contents locally" });
  summary.push({ label: "Conflicts", value: conflicts[config.conflictResolution] });
  if (config.schedule.enabled) summary.push({ label: "Schedule", value: `Your ${config.schedule.frequency} schedule at ${config.schedule.time} will also use these rules while Tidy is open.` });
  if (config.watchEnabled) summary.push({ label: "Folder watching", value: "New arrivals will use these rules after you apply them." });
  return { config, smartRenameEnabled, summary, openPreview: patch.execute === true };
}
