/**
 * Types shared across the renderer.
 *
 * Types that describe the main-process contract (`PreviewFile`, `ElectronAPI`,
 * …) live in `src/electron.d.ts`; this module covers UI-level shapes only.
 */
import type { Icon } from "./components/icons";
import type { DateFilter } from "../shared/dateFilters";
export type { DateFilter };
import type { MetadataGrouping } from "../../electron/lib/macFileMetadata";
export type { MetadataGrouping };

/** Coarse size buckets offered in the filter row. */
export type SizeFilter = "any" | "small" | "medium" | "large";

/** What to do when a file already exists at the destination path. */
export type ConflictResolution = "rename" | "overwrite" | "skip" | "archive" | "trash";
export type OrganizationMode = "move" | "tags";

/** How often an unattended run should fire. `manual` means "never". */
export type ScheduleType = "manual" | "daily" | "weekly" | "monthly";

/** The filter set applied to a folder scan. */
export interface Filters {
  dateModified: DateFilter;
  olderThanDays?: number;
  fileSize: SizeFilter;
  excludeHidden: boolean;
}

export interface Category {
  id: string;
  name: string;
  enabled: boolean;
  extensions: string[];
  subfolders: boolean;
  smartCategorization?: boolean;
  duplicateDetection?: boolean;
}

export interface OrganizerConfig {
  includeSubfolders?: boolean;
  selectedSourceFolders?: string[] | null;
  selectedFileExtensions?: string[] | null;
  sourcePath: string;
  destPath: string;
  categories: Category[];
  filters: Filters;
  conflictResolution: ConflictResolution;
  watchEnabled?: boolean;
  organizationMode?: OrganizationMode;
  metadataGrouping?: MetadataGrouping;
  schedule: {
    enabled: boolean;
    frequency: ScheduleType;
    date: Date | null;
    time: string;
  };
}

/**
 * One file move, recorded so the run can be reversed. Written by the main
 * process during a run and replayed in reverse by `undoOrganize`.
 */
export interface Operation {
  originalPath: string;
  newPath: string;
  originalName: string;
  newName: string;
  finderTag?: { name: string; device: number; inode: number };
}

/** A line in the run log shown in the status bar. */
export interface LogEvent {
  level: "info" | "warn" | "error" | "success";
  message: string;
  /** Wall-clock time, pre-formatted by the main process. */
  time: string;
}

/** Raw per-heuristic counts returned by the folder-insights scan. */
export interface InsightData {
  counts: Record<string, number>;
  total: number;
}

/** A single actionable row inside an insight group. */
export interface InsightItem {
  label: string;
  count: number;
  action: { label: string; onClick: () => void };
}

/** A titled group of insights rendered in the Insights sidebar. */
export interface InsightGroup {
  title: string;
  icon: Icon;
  accentColor: string;
  items: InsightItem[];
}

/** Inline success/failure feedback for the AI command bar. */
export interface AiFeedback {
  type: "success" | "error";
  message: string;
}
