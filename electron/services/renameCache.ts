/**
 * On-disk cache of AI rename suggestions.
 *
 * Suggestions cost an API call each, and previewing the same folder twice is
 * common, so results are keyed by full path, size, and modification time.
 * Two folders can contain different files with the same name and byte length.
 */
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { RenameSuggestion } from "../types";
import { validateRenameSuggestions } from "./smartRename";
import { normalizeNamingStyle, type NamingStyle, type RenameEngine } from "../../src/shared/naming";

const CACHE_FILENAME = ".file-organizer-cache.json";
const CACHE_LIMIT = 2000;
const CACHE_VERSION = 3;

let cache = new Map<string, RenameSuggestion>();
let cachePath = "";

/** Cache key for a file. Must be stable across runs. */
export function cacheKey(filePath: string, sizeBytes: number, modifiedMs: number, style: NamingStyle = "descriptive", engine: RenameEngine = "gemini"): string {
  return JSON.stringify([filePath, sizeBytes, modifiedMs, normalizeNamingStyle(style), CACHE_VERSION, engine]);
}

/** Load the cache from the user-data directory. Call once, after `app.whenReady`. */
export function loadRenameCache(): void {
  cachePath = path.join(app.getPath("userData"), CACHE_FILENAME);
  try {
    if (!fs.existsSync(cachePath)) return;
    const parsed = JSON.parse(fs.readFileSync(cachePath, "utf-8")) as Record<string, RenameSuggestion>;
    cache = new Map();
    for (const [key, value] of Object.entries(parsed)) {
      try {
        const [filePath, size, modifiedMs, style, version, engine] = JSON.parse(key);
        if (version !== CACHE_VERSION || style !== normalizeNamingStyle(style)) continue;
        if (engine !== "gemini" && engine !== "on-device") continue;
        if (typeof filePath !== "string" || typeof size !== "number" || typeof modifiedMs !== "number") continue;
        const source = value?.source === "local" || value?.source === "ocr" ? value.source : "ai";
        const valid = validateRenameSuggestions([{ id: "cached", name: path.basename(filePath), path: filePath, size }], { cached: value }, source).cached;
        if (valid) setCachedRename(key, valid);
      } catch { /* Discard entries written by an older cache format. */ }
    }
  } catch (error) {
    // A corrupt cache is not worth blocking launch over; start empty.
    console.warn("Could not read the rename cache; starting fresh.", error);
  }
}

export function getCachedRename(key: string): RenameSuggestion | undefined {
  return cache.get(key);
}

export function setCachedRename(key: string, suggestion: RenameSuggestion): void {
  cache.delete(key);
  cache.set(key, suggestion);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
}

/** Persist the cache. Called once per preview scan, not once per suggestion. */
export function saveRenameCache(): void {
  if (!cachePath) return;
  try {
    fs.writeFileSync(cachePath, JSON.stringify(Object.fromEntries(cache), null, 2));
  } catch (error) {
    console.warn("Could not write the rename cache.", error);
  }
}
