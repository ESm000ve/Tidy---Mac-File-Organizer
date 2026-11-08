/**
 * Building the preview: what a run *would* do, without touching anything.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  abbreviateHome,
  buildExtensionMap,
  fingerprintFile,
  formatBytes,
  passesFilters,
  walkSourceFiles,
  type SourceScanOptions,
} from "../lib/files";
import { cacheKey, getCachedRename, saveRenameCache, setCachedRename } from "./renameCache";
import { suggestRenames } from "./smartRename";
import { getApiKey } from "./gemini";
import { contentFolderYear, metadataFolder, type MetadataGrouping } from "../lib/macFileMetadata";
import { normalizeNamingStyle, type NamingStyle, type RenameEngine } from "../../src/shared/naming";
import type { CategoryRule, FileForRename, PreviewEntry, RenameSuggestion, RunFilters } from "../types";

/**
 * Preview is capped so a folder with thousands of files still opens promptly.
 * The run itself is not capped — it processes everything.
 */
const PREVIEW_FILE_LIMIT = 50;

/** Files per Smart Rename request. Batches are sent concurrently. */
const RENAME_BATCH_SIZE = 10;

/** Enumerate the files in `sourcePath` and describe what would happen to each. */
async function collectEntries(
  sourcePath: string,
  categories: CategoryRule[],
  filters: RunFilters,
  scope: SourceScanOptions,
): Promise<PreviewEntry[]> {
  const extensionMap = buildExtensionMap(categories, { enabledOnly: true });
  const entries: PreviewEntry[] = [];
  const duplicateCandidates: PreviewEntry[] = [];
  const duplicateSizeCounts = new Map<number, number>();

  for await (const file of walkSourceFiles(sourcePath, { ...scope, excludeHidden: filters.excludeHidden })) {
    const { name: filename, path: fullPath, stats } = file;
    const extension = path.extname(filename).toLowerCase();
    const category = extensionMap.get(extension);
    if (!category || !passesFilters(stats, filename, filters)) continue;

    const entry: PreviewEntry = {
      id: crypto.randomUUID(),
      name: filename,
      relativePath: file.relativePath,
      ext: extension.slice(1),
      size: formatBytes(stats.size),
      sizeBytes: stats.size,
      from: abbreviateHome(path.dirname(fullPath)),
      path: fullPath,
      category: (category?.name ?? "Other").toLowerCase(),
      categoryId: category.id,
      modifiedMs: stats.mtimeMs,
      needsReview: false,
      isDuplicate: false,
    };
    entries.push(entry);
    if (category.duplicateDetection) {
      duplicateCandidates.push(entry);
      duplicateSizeCounts.set(stats.size, (duplicateSizeCounts.get(stats.size) ?? 0) + 1);
    }

    if (entries.length >= PREVIEW_FILE_LIMIT) break;
  }

  const seenFingerprints = new Map<string, string>();
  for (const entry of duplicateCandidates) {
    if ((duplicateSizeCounts.get(entry.sizeBytes) ?? 0) < 2) continue;
    try {
      const fingerprint = await fingerprintFile(entry.path, entry.sizeBytes);
      const original = seenFingerprints.get(fingerprint);
      if (original) {
        entry.isDuplicate = true;
        entry.duplicateOf = original;
      } else {
        seenFingerprints.set(fingerprint, entry.relativePath);
      }
    } catch (error) {
      // An unreadable file is simply not compared; it still appears in the list.
      console.warn(`Could not fingerprint ${entry.name}.`, error);
    }
  }

  return entries;
}

/**
 * Attach AI rename suggestions to the entries, reusing cached results and
 * requesting the rest in concurrent batches.
 */
async function attachRenameSuggestions(entries: PreviewEntry[], style: NamingStyle, smartSortIds: Set<string>, engine: RenameEngine): Promise<void> {
  const suggestions: Record<string, RenameSuggestion> = {};
  const pending: (FileForRename & { key: string })[] = [];
  const online = engine === "gemini" && !!getApiKey();

  for (const entry of entries) {
    const key = cacheKey(entry.path, entry.sizeBytes, entry.modifiedMs, style, engine);
    const cached = getCachedRename(key);
    if (cached && (engine === "on-device" ? cached.source === "ocr" || cached.source === "local" : !online || cached.source === "ai")) {
      suggestions[entry.id] = cached;
    } else {
      pending.push({ id: entry.id, name: entry.name, path: entry.path, size: entry.sizeBytes, modifiedMs: entry.modifiedMs, key });
    }
  }

  if (pending.length > 0) {
    const batches: Promise<void>[] = [];
    const batchSize = engine === "on-device" ? pending.length : RENAME_BATCH_SIZE;
    for (let index = 0; index < pending.length; index += batchSize) {
      const batch = pending.slice(index, index + batchSize);
      batches.push(
        suggestRenames(batch, style, engine).then((batchSuggestions) => {
          for (const [fileId, suggestion] of Object.entries(batchSuggestions)) {
            suggestions[fileId] = suggestion;
            const source = batch.find((file) => file.id === fileId);
            if (source) setCachedRename(source.key, suggestion);
          }
        }),
      );
    }
    await Promise.all(batches);
    saveRenameCache();
  }

  for (const entry of entries) {
    const suggestion = suggestions[entry.id];
    // A suggestion identical to the current name is not worth showing.
    if (!suggestion || (suggestion.suggested === entry.name && !(suggestion.subfolder && smartSortIds.has(entry.categoryId)))) continue;
    entry.smartRename = {
      source: suggestion.source,
      suggested: suggestion.suggested,
      reason: suggestion.reason || "AI generated suggestion",
      confidence: suggestion.confidence || "medium",
      subfolder: suggestion.subfolder,
      contentYear: suggestion.contentYear,
    };
    entry.classSource = suggestion.source === "ai" ? "ai" : "metadata";
  }
}

/**
 * Scan a folder and return what the preview sheet should show.
 *
 * Missing or unreadable folders throw so the UI can distinguish an error from
 * an empty folder. Only matching rules and filters enter the preview or AI call.
 */
export async function buildPreview(
  sourcePath: string,
  categories: CategoryRule[],
  smartRenameEnabled = false,
  filters: RunFilters = { dateModified: "any", fileSize: "any", excludeHidden: false },
  namingStyle: NamingStyle = "descriptive",
  scope: SourceScanOptions & { organizationMode?: "move" | "tags"; metadataGrouping?: MetadataGrouping; renameEngine?: RenameEngine } = {},
): Promise<PreviewEntry[]> {
    if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error("The source folder no longer exists. Choose it again.");
    const entries = await collectEntries(sourcePath, categories, filters, scope);
    if (scope.organizationMode === "tags") return entries;
    const smartSortIds = new Set(categories.filter(category => category.smartCategorization).map(category => category.id));
    if (scope.metadataGrouping && scope.metadataGrouping !== "none" && scope.metadataGrouping !== "content-year") {
      for (let offset = 0; offset < entries.length; offset += RENAME_BATCH_SIZE) {
        await Promise.all(entries.slice(offset, offset + RENAME_BATCH_SIZE).map(async entry => {
          entry.metadataFolder = await metadataFolder(entry.path, scope.metadataGrouping);
        }));
      }
    }
    const aiEntries = entries.filter(entry => !entry.isDuplicate && (smartRenameEnabled || smartSortIds.has(entry.categoryId)));
    if (aiEntries.length > 0) {
      await attachRenameSuggestions(aiEntries, normalizeNamingStyle(namingStyle), smartSortIds, scope.renameEngine === "on-device" ? "on-device" : "gemini");
    }
    if (scope.metadataGrouping === "content-year") {
      const dated = aiEntries.filter(entry => smartSortIds.has(entry.categoryId) && entry.smartRename?.subfolder);
      for (let offset = 0; offset < dated.length; offset += RENAME_BATCH_SIZE) {
        await Promise.all(dated.slice(offset, offset + RENAME_BATCH_SIZE).map(async entry => {
          entry.contentYear = entry.smartRename?.contentYear ?? await contentFolderYear(entry.path, entry.modifiedMs);
        }));
      }
    }
    return entries;
}
