/**
 * Applying the AI rule parser's output to organizer state.
 *
 * The main process turns a sentence like "move old PDFs to Archive" into a
 * patch describing which categories to add, which to update, and which filters
 * to change. Two places in the UI consume that patch — the inline command bar
 * and the advanced rule builder — so the merge logic lives here rather than
 * being written out twice.
 *
 * Everything the model returns is untrusted: fields may be missing, null, or
 * the wrong type. These helpers validate defensively and ignore anything they
 * don't recognise instead of throwing.
 */
import type { Category, Filters, SizeFilter } from "../types";
import { isDateFilter, isOlderDays } from "../../shared/dateFilters";

/** A category the model wants to create. */
export interface AiNewCategory {
  name?: string;
  extensions?: string[];
  subfolders?: boolean;
  smartCategorization?: boolean;
  duplicateDetection?: boolean;
}

/** A patch against an existing category, identified by id. */
export interface AiCategoryUpdate {
  id?: string;
  enabled?: boolean;
  extensions?: string[];
  subfolders?: boolean;
  smartCategorization?: boolean;
  duplicateDetection?: boolean;
}

/** The full patch returned by `ai:parseRule`. Every field is optional. */
export interface AiRulePatch {
  includeSubfolders?: boolean | null;
  /** A question instead of a patch when the instruction cannot be interpreted safely. */
  clarification?: string | null;
  newCategories?: AiNewCategory[] | null;
  updateCategories?: AiCategoryUpdate[] | null;
  updateFilters?: Partial<Filters> | null;
  smartRename?: boolean | null;
  sourcePath?: string | null;
  destPath?: string | null;
  /** True when the user asked to run immediately, not just configure rules. */
  execute?: boolean | null;
}

const SIZE_FILTERS: SizeFilter[] = ["any", "small", "medium", "large"];

function readExtensions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.filter((extension): extension is string => typeof extension === "string").map(extension => extension.trim().replace(/^\./, "").toLowerCase()).filter(extension => /^[a-z0-9][a-z0-9_-]{0,31}$/.test(extension)))];
}

/** Ids for AI-created categories are random so repeated rules never collide. */
function createCategoryId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Merge an AI patch into the current category list.
 *
 * Returns a new array; the input is never mutated. A category's `id` and `name`
 * are preserved on update, so the model can toggle behaviour but cannot rename
 * or re-key a rule the user already recognises.
 */
export function applyCategoryPatch(current: Category[], patch: AiRulePatch): Category[] {
  const next = [...current];

  if (Array.isArray(patch.newCategories)) {
    for (const candidate of patch.newCategories) {
      if (!candidate || typeof candidate !== "object" || typeof candidate.name !== "string") continue;
      const extensions = readExtensions(candidate.extensions);
      const name = candidate.name.trim();
      if (!name || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || !extensions?.length) continue;
      next.push({
        id: createCategoryId(),
        name,
        enabled: true,
        extensions,
        subfolders: candidate.subfolders === true,
        smartCategorization: candidate.smartCategorization === true,
        duplicateDetection: candidate.duplicateDetection === true,
      });
    }
  }

  if (Array.isArray(patch.updateCategories)) {
    for (const update of patch.updateCategories) {
      if (!update?.id) continue;
      const index = next.findIndex((category) => category.id === update.id);
      if (index === -1) continue;
      const clean: Partial<Category> = {};
      for (const field of ["enabled", "subfolders", "smartCategorization", "duplicateDetection"] as const) {
        if (typeof update[field] === "boolean") clean[field] = update[field];
      }
      const extensions = readExtensions(update.extensions);
      if (extensions) clean.extensions = extensions;
      next[index] = { ...next[index], ...clean };
    }
  }

  return next;
}

/**
 * Merge an AI patch into the current filters, dropping any value that isn't a
 * member of the corresponding union.
 */
export function applyFilterPatch(current: Filters, patch: AiRulePatch): Filters {
  const update = patch.updateFilters;
  if (!update) return current;

  const next = { ...current };
  if (isDateFilter(update.dateModified)) {
    next.dateModified = update.dateModified;
  }
  if (next.dateModified === "older" && isOlderDays(update.olderThanDays)) {
    next.olderThanDays = update.olderThanDays;
  }
  if (update.fileSize && SIZE_FILTERS.includes(update.fileSize)) {
    next.fileSize = update.fileSize;
  }
  if (typeof update.excludeHidden === "boolean") {
    next.excludeHidden = update.excludeHidden;
  }
  return next;
}

/** A non-empty absolute path from the patch, or `null` if the model omitted it. */
export function readPath(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
