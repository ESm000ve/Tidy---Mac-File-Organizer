/**
 * The contract between the renderer and the Electron main process.
 *
 * `electron/preload.ts` exposes exactly this surface on `window.electron`; the
 * main process implements it in `electron/ipc/`. Keeping the shape in one file
 * means a change to any handler shows up as a type error on both sides.
 */
import type { Category, Filters, InsightData, LogEvent, MetadataGrouping, Operation, OrganizationMode, OrganizerConfig } from "./app/types";
import type { AcceptedRename, ScheduledRunSummary } from "../electron/types";
import type { FileSearchResult } from "../electron/services/fileSearch";
export type { FileSearchResult };
import type { NamingStyle, RenameEngine } from "./shared/naming";

/** An AI-proposed rename for one file, shown for approval in the preview sheet. */
export interface SmartRenameInfo {
  source?: "ai" | "local" | "ocr";
  suggested: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  /** Semantic destination subfolder, e.g. "Screenshots" or "Invoices". */
  subfolder?: string;
  contentYear?: string;
}

/** One file as it appears in the preview sheet, before anything has moved. */
export interface PreviewFile {
  /** Path relative to the selected source; unique even for repeated filenames. */
  relativePath?: string;
  id: string;
  name: string;
  /** Extension without the leading dot. */
  ext: string;
  /** Human-readable size, e.g. "1.4 MB". */
  size: string;
  /** Size in bytes, for sorting and thresholds. */
  sizeBytes: number;
  /** Source folder, with the user's home directory abbreviated to `~`. */
  from: string;
  path?: string;
  to?: string;
  category: string;
  categoryId?: string;
  /** What decided this file's category. */
  classSource?: "extension" | "metadata" | "ai";
  confidence?: "high" | "medium" | "low";
  rename?: { from: string; to: string };
  smartRename?: SmartRenameInfo;
  needsReview: boolean;
  isDuplicate?: boolean;
  /** Name of the earlier file this one duplicates. */
  duplicateOf?: string;
  metadataFolder?: string[];
  contentYear?: string;
}

/** Summary of a completed run. */
export interface OrganizeResult {
  success: boolean;
  moved?: number;
  tagged?: number;
  trashed?: number;
  renamed?: number;
  duplicates?: number;
  errors?: number;
  error?: string;
  /** Every move performed, in order, so the run can be reversed. */
  operations?: Operation[];
}

export interface UndoResult {
  error?: string;
  success: boolean;
  reverted?: number;
  errors?: number;
  remainingOperations?: Operation[];
}

export interface ScheduleResult {
  success: boolean;
  message?: string;
  error?: string;
}

/** Result of parsing a natural-language rule. `data` is an `AiRulePatch`. */
export interface ParseRuleResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Live progress reported while a run is in flight. */
export interface OrganizeProgress {
  status: "scanning" | "running" | "completed" | "error";
  progress: number;
}

/** Configuration sent to `organizeFiles`: the UI config plus per-run overrides. */
export type OrganizeRequest = OrganizerConfig & {
  renames?: Record<string, AcceptedRename>;
};

/**
 * Everything the renderer may ask the main process to do.
 *
 * Subscription methods return an unsubscribe function; call it when the
 * component that registered the listener goes away.
 */
export interface ElectronAPI {
  getApiKeyStatus: () => Promise<{ configured: boolean; saved: boolean; environment: boolean; unreadable: boolean }>;
  saveApiKey: (key: string) => Promise<{ success: boolean; error?: string }>;
  removeApiKey: () => Promise<{ success: boolean; error?: string }>;
  testApiKey: () => Promise<{ success: boolean; error?: string }>;
  getSourceChoices: (sourcePath: string, scope?: { includeSubfolders?: boolean; destPath?: string; excludeHidden?: boolean }) => Promise<string[]>;
  getPathForFile: (file: File) => string;
  setTheme: (theme: "light" | "dark" | "system") => Promise<void>;
  organizeFiles: (config: OrganizeRequest) => Promise<OrganizeResult>;
  openDirectory: () => Promise<string | null>;
  previewFile: (path: string) => Promise<void>;
  quickLook: (path: string) => Promise<boolean>;
  getFolderPreview: (
    sourcePath: string,
    categories: Category[],
    smartRenameEnabled?: boolean,
    filters?: Filters,
    namingStyle?: NamingStyle,
    scope?: { includeSubfolders?: boolean; destPath?: string; selectedSourceFolders?: string[] | null; selectedFileExtensions?: string[] | null; organizationMode?: OrganizationMode; metadataGrouping?: MetadataGrouping; renameEngine?: RenameEngine },
  ) => Promise<PreviewFile[]>;
  getFolderInsights: (sourcePath: string, scope?: { includeSubfolders?: boolean; destPath?: string; selectedSourceFolders?: string[] | null; selectedFileExtensions?: string[] | null }) => Promise<InsightData>;
  onOrganizeProgress: (callback: (data: OrganizeProgress) => void) => () => void;
  onOrganizeLog: (callback: (event: LogEvent) => void) => () => void;
  parseRule: (rule: string, currentConfig: unknown) => Promise<ParseRuleResult>;
  suggestFolderRules: (source: string, scope: { includeSubfolders?: boolean; destPath?: string; selectedSourceFolders?: string[] | null; selectedFileExtensions?: string[] | null }) => Promise<ParseRuleResult & { sampleCount?: number }>;
  searchOrganizedFiles: (destination: string, query: string) => Promise<{ success: boolean; files?: FileSearchResult[]; error?: string }>;
  openFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
  undoOrganize: (operations: Operation[]) => Promise<UndoResult>;
  saveSchedule: (config: OrganizerConfig) => Promise<ScheduleResult>;
  getScheduledRunSummary: () => Promise<ScheduledRunSummary | null>;
  onScheduledRunComplete: (callback: (summary: ScheduledRunSummary) => void) => () => void;
  onAutomationNotice: (callback: (message: string) => void) => () => void;
  onMenuAction: (callback: (action: string) => void) => () => void;
  onFullScreenChange: (callback: (isFullScreen: boolean) => void) => () => void;
}

declare global {
  interface Window {
    /**
     * Undefined when the renderer runs in a plain browser (`npm run dev` in a
     * tab, tests). Every caller must handle its absence.
     */
    electron?: ElectronAPI;
  }
}
