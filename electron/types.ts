/**
 * Types used inside the main process.
 *
 * The renderer-facing contract lives in `src/electron.d.ts`; these are the
 * shapes the handlers and services pass among themselves.
 */

/** A category rule as configured in the UI. */
export interface CategoryRule {
  id: string;
  name: string;
  enabled: boolean;
  extensions: string[];
  subfolders: boolean;
  smartCategorization?: boolean;
  duplicateDetection?: boolean;
}

export interface RunFilters {
  dateModified: import("../src/shared/dateFilters").DateFilter;
  olderThanDays?: number;
  fileSize: "any" | "small" | "medium" | "large";
  excludeHidden: boolean;
}

export type ConflictResolution = "rename" | "overwrite" | "skip" | "archive" | "trash";

export interface ScheduleSettings {
  enabled: boolean;
  frequency: "manual" | "daily" | "weekly" | "monthly";
  date: string | Date | null;
  /** 24-hour "HH:MM". */
  time: string;
}

/** A preview suggestion the user accepted, keyed by source-relative path. */
export interface AcceptedRename {
  suggested: string;
  confidence?: string;
  subfolder?: string;
  source?: RenameSuggestion["source"];
  contentYear?: string;
}

/** The full request for a run, as sent from the renderer. */
export interface OrganizeRequest {
  includeSubfolders?: boolean;
  selectedSourceFolders?: string[] | null;
  selectedFileExtensions?: string[] | null;
  sourcePath: string;
  destPath: string;
  categories: CategoryRule[];
  filters: RunFilters;
  conflictResolution: ConflictResolution;
  schedule?: ScheduleSettings;
  renames?: Record<string, AcceptedRename>;
  watchEnabled?: boolean;
  organizationMode?: "move" | "tags";
  metadataGrouping?: import("./lib/macFileMetadata").MetadataGrouping;
}

/** One completed move, recorded so the run can be reversed. */
export interface Operation {
  originalPath: string;
  newPath: string;
  originalName: string;
  newName: string;
  finderTag?: { name: string; device: number; inode: number };
}

export type LogLevel = "info" | "warn" | "error" | "success";

export interface RunCallbacks {
  onProgress?: (percent: number) => void;
  onLog?: (level: LogLevel, message: string) => void;
  trashFile?: (filePath: string) => Promise<void>;
}

export interface RunResult {
  success: boolean;
  moved?: number;
  tagged?: number;
  trashed?: number;
  renamed?: number;
  duplicates?: number;
  errors?: number;
  error?: string;
  operations?: Operation[];
}

export interface ScheduledRunSummary {
  moved: number;
  tagged?: number;
  trashed?: number;
  undoId?: string;
  renamed: number;
  duplicates: number;
  errors: number;
  timestamp: string;
  destPath: string;
  operations: Operation[];
}

/** An AI rename suggestion for one file. */
export interface RenameSuggestion {
  source?: "ai" | "local" | "ocr";
  suggested: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  subfolder?: string;
  contentYear?: string;
}

/** The subset of file metadata the rename service needs. */
export interface FileForRename {
  id: string;
  name: string;
  path: string;
  /** Size in bytes. */
  size: number;
  modifiedMs?: number;
}

/** One row in the preview sheet. */
export interface PreviewEntry {
  relativePath: string;
  id: string;
  name: string;
  ext: string;
  size: string;
  sizeBytes: number;
  from: string;
  path: string;
  category: string;
  categoryId: string;
  modifiedMs: number;
  needsReview: boolean;
  isDuplicate: boolean;
  duplicateOf?: string;
  metadataFolder?: string[];
  contentYear?: string;
  smartRename?: RenameSuggestion;
  classSource?: "extension" | "metadata" | "ai";
}
