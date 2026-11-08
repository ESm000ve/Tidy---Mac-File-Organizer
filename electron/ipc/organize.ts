/**
 * Previewing, running, and reversing an organize job.
 */
import { walkSourceFiles, type SourceScanOptions } from "../lib/files";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app, ipcMain, shell } from "electron";
import { CHANNELS } from "../channels";
import { scanFolderInsights } from "../services/insights";
import { runOrganizeJob, undoOperations } from "../services/organizer";
import { buildPreview } from "../services/preview";
import type { CategoryRule, LogLevel, Operation, OrganizeRequest, RunFilters, RunResult, ScheduledRunSummary } from "../types";
import type { NamingStyle } from "../../src/shared/naming";
import { getMainWindow, sendToRenderer } from "../window";
import { authorizeQuickLook } from "./dialogs";
import { searchOrganizedFiles } from "../services/fileSearch";

/** Wall-clock time for a log line, in the 24-hour format the status bar shows. */
function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function registerOrganizeHandlers() {
  const undoPath = path.join(app.getPath("userData"), "organize-undo.json");
  let pendingUndo: Operation[] = [];
  let scheduledSummary: ScheduledRunSummary | null = null;
  try {
    const saved: unknown = JSON.parse(fs.readFileSync(undoPath, "utf8"));
    // Earlier versions stored the bare list for manual runs.
    const record = saved as { operations?: unknown; scheduled?: Omit<ScheduledRunSummary, "operations"> } | null;
    const operations = Array.isArray(saved) ? saved : record?.operations;
    if (!Array.isArray(operations) || !operations.every(operation =>
      typeof operation?.originalPath === "string" && typeof operation?.newPath === "string")) {
      throw new Error("Invalid Undo record.");
    }
    pendingUndo = operations;
    if (!Array.isArray(saved) && record?.scheduled) scheduledSummary = { ...record.scheduled, operations };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Could not load the Undo record.", error);
  }
  let jobActive = false;
  let onRestored: ((filePath: string) => void) | undefined;

  function saveUndo(operations: Operation[], summary: ScheduledRunSummary | null): void {
    pendingUndo = operations;
    scheduledSummary = summary ? { ...summary, operations } : null;
    if (operations.length === 0 && !scheduledSummary) {
      fs.rmSync(undoPath, { force: true });
      return;
    }
    const { operations: _operations, ...scheduled } = scheduledSummary ?? { operations: [] };
    fs.writeFileSync(undoPath + ".tmp", JSON.stringify({ operations, scheduled: scheduledSummary && scheduled }), { mode: 0o600 });
    fs.renameSync(undoPath + ".tmp", undoPath);
  }

  ipcMain.handle(CHANNELS.getSourceChoices, async (_event, sourcePath: string, scope: SourceScanOptions = {}) => {
    const folders: string[] = [];
    for await (const _file of walkSourceFiles(sourcePath, { includeSubfolders: scope.includeSubfolders, destPath: scope.destPath, excludeHidden: scope.excludeHidden, onDirectory: folder => folders.push(folder) })) { /* inventory only */ }
    return folders;
  });
  ipcMain.handle(CHANNELS.getFolderInsights, (_event, sourcePath: string, scope?: SourceScanOptions) =>
    scanFolderInsights(sourcePath, scope),
  );

  ipcMain.handle(
    CHANNELS.getFolderPreview,
    async (event, sourcePath: string, categories: CategoryRule[], smartRenameEnabled?: boolean, filters?: RunFilters, namingStyle?: NamingStyle, scope?: Parameters<typeof buildPreview>[5]) => {
      const entries = await buildPreview(sourcePath, categories, smartRenameEnabled, filters, namingStyle, scope);
      authorizeQuickLook(event.sender, entries.map(entry => entry.path));
      return entries;
    },
  );
  ipcMain.handle(CHANNELS.searchOrganizedFiles, async (event, destination: string, query: string) => {
    if (typeof destination !== "string" || typeof query !== "string" || !query.trim()) {
      return { success: false, error: "Choose an organized folder and enter a search." };
    }
    try {
      const files = await searchOrganizedFiles(destination, query);
      authorizeQuickLook(event.sender, files.map(file => file.path));
      return { success: true, files };
    } catch {
      return { success: false, error: "Tidy could not search that folder. Check that it is available." };
    }
  });

  /**
   * Run the job, streaming progress and log lines back to the window that
   * started it so the UI can update while files are still moving.
   */
  const busyMessage = "Tidy is already moving or restoring files. Wait for it to finish.";
  ipcMain.handle(CHANNELS.organizeRun, async (event, request: OrganizeRequest) => {
    if (jobActive) return { success: false, error: busyMessage };
    jobActive = true;
    const log = (level: LogLevel, message: string) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(CHANNELS.organizeLog, { level, message, time: timestamp() });
      }
    };
    try {
      const result = await runOrganizeJob(request, {
        trashFile: shell.trashItem,
        onProgress: progress => {
          getMainWindow()?.setProgressBar(progress / 100);
          if (!event.sender.isDestroyed()) {
            event.sender.send(CHANNELS.organizeProgress, { status: "running", progress });
          }
        },
        onLog: log,
      });
      if (result.success) {
        try { saveUndo(result.operations ?? [], null); }
        catch { log("warn", "The Undo record could not be saved. Undo is available until Tidy quits."); }
      }
      return result;
    } finally {
      getMainWindow()?.setProgressBar(-1);
      jobActive = false;
    }
  });

  async function undoLatest() {
    if (jobActive) return { success: false, error: busyMessage };
    if (pendingUndo.length === 0) {
      return { success: false, remainingOperations: [], error: "Tidy has no saved Undo record for this run." };
    }
    jobActive = true;
    try {
      // Consume the disk record first so an interrupted Undo cannot replay
      // an already reversed overwrite from a stale record after restart.
      try { fs.rmSync(undoPath, { force: true }); }
      catch { return { success: false, error: "Tidy could not update its saved Undo record." }; }
      const result = await undoOperations(pendingUndo, filePath => onRestored?.(filePath));
      try { saveUndo(result.remainingOperations, scheduledSummary); }
      catch { return { ...result, error: "Remaining changes could only be saved until Tidy quits." }; }
      return result;
    } finally {
      jobActive = false;
    }
  }

  ipcMain.handle(CHANNELS.organizeUndo, (_event, requested: unknown) => {
    // Renderer paths identify the displayed run. Undo uses the saved record.
    if (pendingUndo.length && (!Array.isArray(requested) || requested.length !== pendingUndo.length ||
        !pendingUndo.every((operation, index) => operation.originalPath === requested[index]?.originalPath &&
          operation.newPath === requested[index]?.newPath))) {
      return { success: false, error: "The requested changes do not match Tidy's saved Undo record." };
    }
    return undoLatest();
  });

  ipcMain.handle(CHANNELS.scheduledRunSummary, () => scheduledSummary);

  async function runInBackground(config: OrganizeRequest, arrivals?: ReadonlyMap<string, string>): Promise<{
    result: RunResult;
    summary?: ScheduledRunSummary;
    undoSaved?: boolean;
    busy?: boolean;
  }> {
    if (jobActive) return { result: { success: false, error: busyMessage }, busy: true };
    jobActive = true;
    try {
      const result = await runOrganizeJob(config, {
        trashFile: shell.trashItem,
        onProgress: progress => getMainWindow()?.setProgressBar(progress / 100),
      }, arrivals);
      if (!result.success || !result.operations?.length) return { result };
      const summary = {
        moved: result.moved ?? 0,
        tagged: result.tagged,
        trashed: result.trashed,
        undoId: arrivals ? undefined : randomUUID(),
        renamed: result.renamed ?? 0,
        duplicates: result.duplicates ?? 0,
        errors: result.errors ?? 0,
        destPath: config.organizationMode === "tags" ? "" : config.destPath,
        timestamp: new Date().toISOString(),
        operations: result.operations,
      };
      try {
        saveUndo(result.operations, summary);
        return { result, summary, undoSaved: true };
      } catch (error) {
        console.error("Could not save scheduled Undo.", error);
        return { result, summary, undoSaved: false };
      }
    } finally {
      getMainWindow()?.setProgressBar(-1);
      jobActive = false;
    }
  }

  return {
    runInBackground,
    getBackgroundUndoId: () => pendingUndo.length ? scheduledSummary?.undoId : undefined,
    setOnRestored: (callback: (filePath: string) => void) => { onRestored = callback; },
    async undoBackgroundRun(id: string) {
      if (scheduledSummary?.undoId !== id) return { success: false, error: "That run is no longer the latest Undo record." };
      const result = await undoLatest();
      if (scheduledSummary) sendToRenderer(CHANNELS.scheduledRunComplete, scheduledSummary);
      return result;
    },
  };
}
