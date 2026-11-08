import { walkSourceFiles, type SourceScanOptions } from "../lib/files";
/**
 * A fast, name-only pass over a folder that powers the Insights sidebar.
 *
 * Everything here is a filename heuristic — nothing is opened or hashed — so
 * the scan stays responsive on large folders. The counts are suggestions for
 * the user, not decisions the organizer acts on.
 */
import fs from "node:fs";
import path from "node:path";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".heic", ".webp"];
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv"];
const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".pages"];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a"];

const INVOICE_WORDS = ["invoice", "receipt", "bill"];
const CONTRACT_WORDS = ["contract", "agreement", "nda"];

/** Names ending in "_1", "(2)", or " copy" — the shape of an accidental copy. */
const COPY_SUFFIX = /(_\d+|\(\d+\)|\scopy)\.\w+$/i;
/** Audio named by track number or left untitled, i.e. missing artist metadata. */
const UNTITLED_AUDIO = /track\s*\d+|untitled/i;

export interface FolderInsights {
  counts: Record<string, number>;
  total: number;
}

const EMPTY: FolderInsights = { counts: {}, total: 0 };

/** Count the heuristics the Insights sidebar reports on. */
export async function scanFolderInsights(sourcePath: string, scope: SourceScanOptions = {}): Promise<FolderInsights> {
  if (!sourcePath || !fs.existsSync(sourcePath)) return EMPTY;

  const counts: Record<string, number> = {
    screenshots: 0,
    photos: 0,
    recordings: 0,
    invoices: 0,
    contracts: 0,
    audioMissingMeta: 0,
    duplicates: 0,
  };
  let total = 0;

  try {
    for await (const file of walkSourceFiles(sourcePath, { ...scope, excludeHidden: true })) {
      const filename = file.name;
      const extension = path.extname(filename).toLowerCase();
      const lower = filename.toLowerCase();

      if (IMAGE_EXTENSIONS.includes(extension)) {
        if (lower.includes("screenshot") || lower.includes("screen shot")) counts.screenshots += 1;
        else counts.photos += 1;
      } else if (VIDEO_EXTENSIONS.includes(extension)) {
        if (lower.includes("screen record")) counts.recordings += 1;
      } else if (DOCUMENT_EXTENSIONS.includes(extension)) {
        if (INVOICE_WORDS.some((word) => lower.includes(word))) counts.invoices += 1;
        if (CONTRACT_WORDS.some((word) => lower.includes(word))) counts.contracts += 1;
      } else if (AUDIO_EXTENSIONS.includes(extension)) {
        if (UNTITLED_AUDIO.test(lower)) counts.audioMissingMeta += 1;
      }

      if (COPY_SUFFIX.test(lower)) counts.duplicates += 1;
      total += 1;
    }

    return { counts, total };
  } catch (error) {
    console.error("Insights scan failed.", error);
    return EMPTY;
  }
}
