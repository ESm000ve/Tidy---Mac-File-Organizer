/**
 * Static configuration for the organizer's built-in categories.
 *
 * These describe Tidy's default behaviour before the user (or the AI rule
 * parser) changes anything. Nothing here depends on runtime state, so it lives
 * outside the component tree.
 */
import type { Category } from "./types";
import {
  Archive,
  BookOpen,
  Document,
  Film,
  MusicList,
  PhotoFill,
  type Icon,
} from "./components/icons";

/** Identifiers of the categories Tidy ships with. */
export const BUILT_IN_CATEGORY_IDS = [
  "documents",
  "images",
  "audio",
  "video",
  "archives",
  "books",
] as const;

export type BuiltInCategoryId = (typeof BUILT_IN_CATEGORY_IDS)[number];

/**
 * Every extension Tidy offers per category. A category's *selected* extensions
 * are a subset of these; the full list is what the extension picker renders.
 */
export const AVAILABLE_EXTENSIONS: Record<BuiltInCategoryId, string[]> = {
  books: ["epub", "kepub", "mobi", "azw", "azw3", "azw4", "kfx", "fb2", "djvu", "djv", "ibooks", "lit", "lrf", "lrx", "cbz", "cbr", "cb7", "cbt", "m4b"],
  documents: ["pdf", "docx", "txt", "xlsx", "pptx", "pages", "numbers", "key", "csv", "md", "rtf", "odt"],
  images: ["jpg", "jpeg", "png", "gif", "svg", "tiff", "raw", "heic", "webp", "bmp", "ico", "psd"],
  audio: ["mp3", "wav", "aac", "flac", "ogg", "m4a", "wma", "alac", "aiff"],
  video: ["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "mpg", "3gp"],
  archives: ["zip", "tar", "gz", "rar", "7z", "dmg", "pkg", "iso", "bz2", "xz", "tgz", "cab"],
};

export const CATEGORY_ICONS: Record<string, Icon> = {
  books: BookOpen,
  documents: Document,
  images: PhotoFill,
  audio: MusicList,
  video: Film,
  archives: Archive,
};

export const CATEGORY_COLORS: Record<string, string> = {
  books: "purple",
  documents: "blue",
  images: "purple",
  audio: "orange",
  video: "green",
  archives: "yellow",
};

/**
 * Subfolders Tidy creates when Smart Categorization is on. With it off, files
 * are filed by extension instead.
 */
export const SMART_SUBFOLDERS: Record<string, string[]> = {
  books: ["Fiction", "Nonfiction", "Comics", "Audiobooks", "Other"],
  documents: ["Invoices", "Receipts", "Contracts", "Reports", "Presentations", "Other"],
  images: ["Screenshots", "Photos", "Scans", "Designs", "Other"],
  audio: ["Music", "Podcasts", "Voice Memos", "Sound Effects", "Other"],
  video: ["Recordings", "Movies", "Clips", "Tutorials", "Other"],
  archives: ["Backups", "Downloads", "Projects", "Other"],
};

const CATEGORY_LABELS: Record<BuiltInCategoryId, string> = {
  books: "Books",
  documents: "Documents",
  images: "Images",
  audio: "Audio",
  video: "Video",
  archives: "Archives",
};

/** A fresh set of default rules — also what "Reset All Rules" restores. */
export function createInitialCategories(): Category[] {
  return BUILT_IN_CATEGORY_IDS.map((id) => ({
    id,
    name: CATEGORY_LABELS[id],
    enabled: true,
    subfolders: true,
    smartCategorization: false,
    duplicateDetection: false,
    extensions: [...AVAILABLE_EXTENSIONS[id]],
  }));
}

export const GLASS_SURFACE = "tidy-surface";

/** localStorage keys. Namespaced so they don't collide with anything else. */
export const STORAGE_KEYS = {
  includeSubfolders: "tidy_include_subfolders",
  namingStyle: "tidy_naming_style",
  metrics: "tidy_metrics",
  sourcePath: "tidy_source_path",
  destPath: "tidy_dest_path",
} as const;
