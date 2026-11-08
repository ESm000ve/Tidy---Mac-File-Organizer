import { useCallback, useEffect, useState, useRef } from "react";
import type { PreviewFile } from "../../electron";
import type { LogEvent, Operation, OrganizerConfig } from "../types";
import type { RunMetrics, RunState } from "../components/StatusBar";
import { STORAGE_KEYS } from "../constants";
import type { NamingStyle, RenameEngine } from "../../shared/naming";
import type { AcceptedRename, ScheduledRunSummary } from "../../../electron/types";

const EMPTY_METRICS: RunMetrics = {
  moved: 0,
  renamed: 0,
  duplicates: 0,
  errors: 0,
  timestamp: null,
  destPath: "",
  operations: [],
};

/** Restore the last run's summary, reviving the timestamp back into a `Date`. */
function loadStoredMetrics(): RunMetrics | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.metrics);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RunMetrics;
    return {
      ...parsed,
      timestamp: parsed.timestamp ? new Date(parsed.timestamp) : null,
    };
  } catch {
    return null;
  }
}

function saveMetrics(metrics: RunMetrics): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.metrics, JSON.stringify(metrics));
  } catch {
    // Metrics are a convenience, not a source of truth — a full quota is fine.
  }
}

/** Last-minute changes made in the preview sheet, merged over the ambient config. */
export interface RunOverrides {
  /** Overrides the configured destination for this run only. */
  destPath?: string;
  /** Per-file suggestions the user accepted, keyed by source-relative path. */
  renames?: Record<string, AcceptedRename>;
}

interface UseOrganizerRunOptions {
  /** The organizer settings as currently configured in the UI. */
  config: OrganizerConfig;
  /** Whether to ask the AI for improved filenames during the preview scan. */
  smartRenameEnabled: boolean;
  namingStyle: NamingStyle;
  renameEngine: RenameEngine;
  /** Surface a message to the user (wired to the notice dialog). */
  onNotice: (message: string) => void;
}

/**
 * Owns everything about executing a run: the preview scan, the run itself,
 * live progress and log streams, the resulting metrics, and undo.
 *
 * Keeping this together means `App` composes one object rather than juggling
 * eight related pieces of state whose transitions have to stay in step.
 */
export function useOrganizerRun({
  config,
  smartRenameEnabled,
  namingStyle,
  renameEngine,
  onNotice,
}: UseOrganizerRunOptions) {
  const [runState, setRunState] = useState<RunState>("idle");
  const [runProgress, setRunProgress] = useState(0);
  const [runMetrics, setRunMetrics] = useState<RunMetrics>(EMPTY_METRICS);
  const [logEvents, setLogEvents] = useState<LogEvent[]>([]);
  const [previewFiles, setPreviewFiles] = useState<PreviewFile[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const previewConfigRef = useRef(config);

  useEffect(() => {
    const stored = loadStoredMetrics();
    if (stored) setRunMetrics(stored);
    let active = true;
    const acceptScheduledRun = (summary: ScheduledRunSummary | null) => {
      if (!active || !summary) return;
      const timestamp = new Date(summary.timestamp);
      setRunMetrics(previous => {
        if (previous.timestamp && previous.timestamp > timestamp) return previous;
        const metrics = { ...summary, timestamp };
        saveMetrics(metrics);
        return metrics;
      });
    };
    const stop = window.electron?.onScheduledRunComplete(acceptScheduledRun);
    void window.electron?.getScheduledRunSummary().then(acceptScheduledRun).catch(console.error);
    return () => {
      active = false;
      stop?.();
    };
  }, []);

  /**
   * Scan the source folder and open the preview sheet.
   *
   * Accepts an explicit path because the AI command bar resolves a folder and
   * runs in the same tick, before the corresponding state update has flushed.
   */
  const startPreview = useCallback(
    async (sourceOverride?: string, previewConfig: OrganizerConfig = config, renameEnabled = smartRenameEnabled) => {
      const source = sourceOverride ?? previewConfig.sourcePath;
      if (!source) {
        onNotice("Please select a source folder first.");
        return;
      }
      if (!window.electron) {
        onNotice("Run Tidy is only available in the desktop app.");
        return;
      }

      previewConfigRef.current = { ...previewConfig, sourcePath: source };
      setRunState("scanning");
      try {
        const files = await window.electron.getFolderPreview(
          source,
          previewConfig.categories,
          renameEnabled,
          previewConfig.filters,
          namingStyle,
          {
            includeSubfolders: previewConfig.includeSubfolders === true,
            destPath: previewConfig.organizationMode === "tags" ? undefined : previewConfig.destPath,
            selectedSourceFolders: previewConfig.selectedSourceFolders,
            selectedFileExtensions: previewConfig.selectedFileExtensions,
            organizationMode: previewConfig.organizationMode,
            metadataGrouping: previewConfig.metadataGrouping,
            renameEngine,
          },
        );
        setPreviewFiles(files);
        setPreviewOpen(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        onNotice(`Failed to scan folder: ${message}`);
      } finally {
        setRunState("idle");
      }
    },
    [config, smartRenameEnabled, namingStyle, renameEngine, onNotice],
  );

  const closePreview = useCallback(() => {
    if (runState === "running") return;
    setPreviewOpen(false);
    if (runState === "completed" || runState === "error") setRunState("idle");
  }, [runState]);

  /**
   * Execute the run the preview sheet just confirmed.
   *
   * `overrides` carries any last-minute edits made in the sheet and is merged
   * over the ambient config.
   */
  const confirmRun = useCallback(
    async (overrides: RunOverrides = {}) => {
      if (!window.electron) {
        onNotice("Run Tidy is only available in the desktop app.");
        return;
      }

      if (previewFiles.length === 0) return;
      const acceptedConfig = previewConfigRef.current;
      const destPath = overrides.destPath || acceptedConfig.destPath;
      if (!destPath && acceptedConfig.organizationMode !== "tags") {
        onNotice("Please select a Destination folder before running Tidy.");
        return;
      }

      setRunState("running");
      setRunProgress(0);
      setLogEvents([]);
      // Preserve the previous Undo record if the new run fails before moving files.

      const stopProgress = window.electron.onOrganizeProgress((data) => {
        if (data.status === "running" || data.status === "scanning") {
          setRunProgress(data.progress ?? 0);
        }
      });
      const stopLog = window.electron.onOrganizeLog((event) => {
        setLogEvents((previous) => [...previous, event]);
      });

      try {
        const result = await window.electron.organizeFiles({ ...acceptedConfig, ...overrides });

        if (!result.success) {
          setRunState("error");
          onNotice(`Run Tidy failed: ${result.error ?? "Unknown error."}`);
          return;
        }

        const metrics: RunMetrics = {
          moved: result.moved ?? 0,
          tagged: result.tagged,
          trashed: result.trashed,
          renamed: result.renamed ?? 0,
          duplicates: result.duplicates ?? 0,
          errors: result.errors ?? 0,
          timestamp: new Date(),
          destPath: acceptedConfig.organizationMode === "tags" ? "" : destPath,
          operations: result.operations ?? [],
        };
        setRunMetrics(metrics);
        saveMetrics(metrics);
        setRunState(result.errors ? "error" : "completed");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown IPC error";
        setRunState("error");
        onNotice(`Run Tidy encountered an error: ${message}`);
      } finally {
        stopProgress();
        stopLog();
      }
    },
    [onNotice, previewFiles],
  );

  /** Reverse a completed run, moving every file back to where it came from. */
  const undo = useCallback(
    async (operations: Operation[], showSuccessNotice = true) => {
      if (!window.electron?.undoOrganize || operations.length === 0) return;

      setIsUndoing(true);
      try {
        const result = await window.electron.undoOrganize(operations);
        setRunMetrics((previous) => {
          const updated = { ...previous, operations: result.remainingOperations ?? (result.success ? [] : operations) };
          saveMetrics(updated);
          return updated;
        });
        if (result.success) {
          if (showSuccessNotice) onNotice(`Reversed ${result.reverted ?? 0} operations.`);
          return true;
        } else {
          onNotice(result.error ?? `Could not reverse ${result.errors ?? 0} operations. Files already restored will not be retried.`);
        }
      } catch {
        onNotice("Undo failed.");
      } finally {
        setIsUndoing(false);
      }
      return false;
    },
    [onNotice],
  );

  return {
    runState,
    runProgress,
    runMetrics,
    logEvents,
    previewFiles,
    previewOpen,
    isUndoing,
    startPreview,
    closePreview,
    confirmRun,
    undo,
  };
}
