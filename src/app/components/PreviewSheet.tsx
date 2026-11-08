import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import * as Dialog from "@radix-ui/react-dialog";

import { clsx } from "clsx";
import type { RunState, RunMetrics } from "./StatusBar";
import type { PreviewFile } from "../../electron";
import type { Category, ConflictResolution, Operation, OrganizationMode } from "../types";
import type { AcceptedRename } from "../../../electron/types";
import { renameNeedsReview } from "../../shared/naming";

import { Warning as AlertTriangle, Archive, ArrowRight, Check, CheckCircle as CheckCircle2, ChevronRight, Copy, Eye, Document as FileText, PhotoFill as ImageIcon, Info, MusicList as Music, Play, Sparkles, Film as Video, X } from "./icons";

// ─── Types ────────────────────────────────────────────────────────────────────
type Confidence = "high" | "medium" | "low";

// ─── Constants & Helpers ──────────────────────────────────────────────────────

const CONFIDENCE_CFG = {
  high: { label: "High", color: "text-[var(--system-green)]", bg: "bg-[var(--system-green)]/10", border: "rgba(50,215,75,0.22)", tip: "Good to go — strongly matched by file type and content" },
  medium: { label: "Review", color: "text-[var(--system-orange)]", bg: "bg-[var(--system-orange)]/10", border: "rgba(255,159,10,0.22)", tip: "Consider reviewing — partial match, check the destination" },
  low: { label: "Verify", color: "text-[var(--system-red)]", bg: "bg-[var(--system-red)]/10", border: "rgba(255,69,58,0.22)", tip: "Needs your attention — low confidence, verify before running" },
};

// Human-readable attribution labels for AI suggestions
const CLASS_SOURCE_LABEL: Record<string, string> = {
  extension: "By file type",
  metadata: "By content",
  ai: "AI assisted",
  filename: "Name pattern",
};

function FileIcon({ ext, className }: { ext: string; className?: string }) {
  const e = ext.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "psd"].includes(e)) return <ImageIcon className={className} />;
  if (["mp3", "wav", "m4a", "flac"].includes(e)) return <Music className={className} />;
  if (["mp4", "mov", "avi", "mkv"].includes(e)) return <Video className={className} />;
  if (["zip", "rar", "7z", "tar", "gz"].includes(e)) return <Archive className={className} />;
  return <FileText className={className} />;
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function ConfidenceChip({ confidence }: { confidence: Confidence }) {
  const cfg = CONFIDENCE_CFG[confidence];
  return (
    <span title={cfg.tip}
      className={clsx("px-1.5 py-0.5 rounded-[4px] text-[12px] font-semibold   border", cfg.color, cfg.bg)}
      style={{ borderColor: cfg.border }}
      aria-label={`Confidence: ${cfg.label}`}>
      {cfg.label}
    </span>
  );
}

function FileRow({
  file,
  smartRenameEnabled, accepted, onToggleAccept,
  dimmed = false,
  categoryConfig,
  organizationMode,
  trashDuplicate = false,
}: {
  file: PreviewFile;
  smartRenameEnabled?: boolean;
  accepted?: boolean;
  onToggleAccept?: (id: string) => void;
  dimmed?: boolean;
  categoryConfig?: Category;
  organizationMode: OrganizationMode;
  trashDuplicate?: boolean;
}) {
  const localSuggestion = file.smartRename?.source === "local";
  const ocrSuggestion = file.smartRename?.source === "ocr";
  const suggestionSource = ocrSuggestion ? "On-device" : localSuggestion ? "Local" : "AI";
  const classSrc = localSuggestion ? "filename" : file.classSource || "extension";
  const conf = file.smartRename?.confidence || file.confidence || "high";
  const suggestsName = Boolean(smartRenameEnabled && file.smartRename && file.smartRename.suggested !== file.name);
  const suggestionLabel = suggestsName ? "name suggestion" : "folder suggestion";
  const suggestionValue = suggestsName ? file.smartRename?.suggested : file.smartRename?.subfolder;
  const reviewDestination = Boolean(accepted && file.smartRename && renameNeedsReview(
    file.smartRename.source, conf, suggestsName,
  ));
  const metadataPath = file.metadataFolder?.join(" › ");
  const semantic = categoryConfig?.smartCategorization && accepted ? file.smartRename?.subfolder : undefined;
  const repeatCategory = file.contentYear && semantic?.toLowerCase() === file.category.toLowerCase();
  const subfolder = metadataPath || (semantic ? [repeatCategory ? undefined : semantic, file.contentYear].filter(Boolean).join(" › ") : file.ext);
  const quickLook = () => { if (file.path) void window.electron?.quickLook(file.path); };

  return (
    <div tabIndex={file.path && window.electron?.quickLook ? 0 : undefined}
      onKeyDown={event => {
        if (event.key === " " && event.currentTarget === event.target) {
          event.preventDefault();
          quickLook();
        }
      }}
      className={clsx(
      "group flex flex-col px-5 py-3.5 transition-colors border-b border-black/[0.06] dark:border-white/[0.04] focus-visible:outline focus-visible:outline-[var(--tidy-focus-ring)]",
      dimmed ? "opacity-40 grayscale-[0.5]" : "hover:bg-white/[0.02]"
    )}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/[0.06] border border-black/10 dark:border-white/[0.08] flex items-center justify-center shrink-0" aria-hidden="true">
            <FileIcon ext={file.ext} className="w-4 h-4 text-foreground dark:text-foreground" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[14px] text-foreground dark:text-foreground font-medium truncate">{file.name}</span>
            <span className="text-[12px] text-muted-foreground mt-0.5 truncate" title={file.from}>{file.relativePath?.split(/[\\/]/).slice(0, -1).join(" › ") || file.from}</span>
          </div>
        </div>

        {/* Destination / Duplicate Status */}
        <div className="w-[140px] hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] bg-black/[0.03] border border-black/[0.05] dark:bg-white/[0.03] dark:border-white/[0.05]">
          {file.isDuplicate ? (
            <span className="text-[12px] text-[var(--system-red)] truncate font-semibold" title={`Duplicate of: ${file.duplicateOf || 'unknown'}`}>
              {trashDuplicate ? "→ Trash" : <>→ Match: <span className="text-[var(--tidy-secondary-label)] dark:text-[var(--tidy-secondary-label)]">{file.duplicateOf || 'Original'}</span></>}
            </span>
          ) : reviewDestination ? (
            <span className="text-[12px] text-[var(--system-orange)] truncate font-semibold" title="Needs Review Routing">Review</span>
          ) : (
            <span className="text-[12px] text-[var(--tidy-secondary-label)] dark:text-[var(--tidy-secondary-label)] truncate capitalize" title={file.category}>{organizationMode === "tags" ? "Tag · " : ""}{file.category}</span>
          )}

          {organizationMode === "move" && !file.isDuplicate && !reviewDestination && (metadataPath || categoryConfig?.subfolders || categoryConfig?.smartCategorization) && (
            <>
              <ChevronRight className="w-2.5 h-2.5 text-[var(--tidy-secondary-label)] dark:text-[var(--tidy-secondary-label)] shrink-0" aria-hidden="true" />
              <span className="text-[12px] text-foreground dark:text-[var(--tidy-secondary-label)] font-medium truncate" title={subfolder}>
                {subfolder}
              </span>
            </>
          )}
        </div>

        {/* Source info (Attribution + Confidence) — HIG ML: show attribution in human terms */}
        {!file.isDuplicate && (
          <div className="w-[90px] hidden lg:flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[12px] text-[var(--tidy-secondary-label)] dark:text-[var(--tidy-secondary-label)] tracking-tight"
                title={classSrc === 'ai' ? 'Suggestion from AI analysis' : classSrc === 'filename' ? 'Suggestion from a local filename pattern; no AI request' : classSrc === 'metadata' ? 'Based on file content analysis' : 'Category determined by file extension'}
              >
                {CLASS_SOURCE_LABEL[classSrc] ?? classSrc}
              </span>
              <ConfidenceChip confidence={conf} />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {file.path && window.electron?.quickLook && (
            <button
              onClick={quickLook}
              aria-label={`Quick Look at ${file.name}`} title="Quick Look (Space)"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 dark:bg-white/[0.05] text-[var(--tidy-secondary-label)] dark:text-[var(--tidy-secondary-label)] hover:bg-black/10 dark:hover:bg-white/[0.1] hover:text-[var(--tidy-secondary-label)] dark:hover:text-[var(--tidy-secondary-label)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)]"
            >
              <Eye className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          {file.smartRename && (
            <button
              onClick={() => onToggleAccept && onToggleAccept(file.id)}
              aria-label={accepted ? `Accepted suggestion for ${file.name}` : `Accept suggestion for ${file.name}`}
              aria-pressed={accepted}
              className={clsx(
                "w-8 h-8 flex items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)]",
                accepted ? "bg-[var(--system-green)]/20 text-[var(--system-green)]" : "bg-black/5 dark:bg-white/[0.05] text-[var(--tidy-secondary-label)] dark:text-[var(--tidy-secondary-label)] hover:bg-black/10 dark:hover:bg-white/[0.1] hover:text-[var(--tidy-secondary-label)] dark:hover:text-[var(--tidy-secondary-label)]"
              )}
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Suggestion label + diff — HIG Generative AI: clearly label AI-generated content */}
      {file.smartRename && (
        <div className="flex flex-col mt-2 ml-11 gap-1" aria-label={`${suggestionSource} ${suggestionLabel}: ${suggestionValue}`}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-[3px] text-[12px] text-[var(--system-purple)] shrink-0 bg-[var(--system-purple)]/10 px-1.5 py-0.5 rounded-sm"
              title="You can accept or ignore this suggestion"
            >
              <Sparkles className="w-2.5 h-2.5" aria-hidden="true" />
              <span>{suggestionSource} {suggestionLabel}</span>
            </span>
            <ArrowRight className="w-2.5 h-2.5 text-[var(--tidy-secondary-label)] dark:text-[var(--tidy-secondary-label)] shrink-0" aria-hidden="true" />
            <span
              className="text-[12px] text-[var(--system-purple)] font-medium truncate"
              title={suggestionValue}
            >
              {suggestionValue}
            </span>
          </div>
          {file.smartRename.reason && (
            <span className="flex items-center gap-1 text-[12px] text-[var(--tidy-secondary-label)] dark:text-[var(--tidy-secondary-label)] leading-snug max-w-[90%]">
              <Info className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
              {file.smartRename.reason}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ColHeaders() {
  return (
    <div className="flex items-center gap-4 px-5 py-2 shrink-0 bg-black/[0.02] dark:bg-white/[0.015] border-b-[0.5px] border-black/5 dark:border-white/[0.04]">
      <span className="flex-1 text-[12px] font-semibold text-muted-foreground dark:text-[var(--tidy-secondary-label)]">File</span>
      <span className="w-[140px] hidden md:block text-[12px] font-semibold text-muted-foreground dark:text-[var(--tidy-secondary-label)]">Destination</span>
      <span className="w-[80px] hidden lg:block text-right text-[12px] font-semibold text-muted-foreground dark:text-[var(--tidy-secondary-label)]">Match</span>
      <div className="w-[68px]" />
    </div>
  );
}

function BulkRenameBar({
  files, onApplyAll, onRevertAll, smartRenameEnabled,
}: {
  files: PreviewFile[];
  onApplyAll: () => void;
  onRevertAll: () => void;
  smartRenameEnabled: boolean;
}) {
  const smartCount = files.filter(f => f.smartRename).length;
  const usesAI = files.some(file => file.smartRename?.source === "ai");
  if (smartCount === 0) return null;

  return (
    <div
      className="px-5 py-2.5 bg-[var(--system-purple)]/5 border-b border-[var(--system-purple)]/10 flex items-center justify-between shrink-0"
      role="region"
      aria-label={`${usesAI ? "AI" : "Tidy"} suggested ${smartCount} changes`}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-[var(--system-purple)]" aria-hidden="true" />
        <span className="text-[12px] text-[var(--system-purple)]">
          {usesAI ? "AI suggested" : "Suggested"} {smartCount} {smartRenameEnabled ? "name" : "folder"}{smartCount !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onRevertAll}
          aria-label="Ignore all AI suggestions"
          className="text-[12px] text-[var(--tidy-secondary-label)] dark:text-[var(--tidy-secondary-label)] hover:text-foreground dark:hover:text-foreground transition-colors capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)] rounded px-2 py-1"
        >
          Ignore all
        </button>
        <button
          onClick={onApplyAll}
          aria-label="Accept all AI suggestions"
          className="text-[12px] text-[var(--system-purple)] font-semibold opacity-90 hover:opacity-100 transition-opacity capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)] rounded px-2 py-1"
        >
          Accept all
        </button>
      </div>
    </div>
  );
}

function RunningMessage() {
  return (
    <div
      className="py-6 flex flex-col items-center justify-center shrink-0"
      role="status"
      aria-label="Organizing files, please wait"
      aria-live="polite"
    >
      <div className="w-12 h-12 rounded-full border-2 border-[var(--system-blue)]/20 border-t-[var(--system-blue)] animate-spin mb-4" aria-hidden="true" />
      <p className="text-[14px] text-[var(--tidy-secondary-label)] dark:text-[var(--tidy-secondary-label)] font-medium">Tidying your files…</p>
      <p className="text-[12px] text-muted-foreground dark:text-[var(--tidy-secondary-label)] mt-1">This may take a moment depending on file count</p>
    </div>
  );
}

function SummaryStrip({
  files, runState, progress, smartRenameEnabled, acceptedRenameCount,
}: {
  files: PreviewFile[];
  runState: RunState;
  progress: number;
  smartRenameEnabled?: boolean;
  acceptedRenameCount?: number;
}) {
  const renameCount = smartRenameEnabled ? (acceptedRenameCount ?? 0) : 0;
  const reviewCount = files.filter(f => f.needsReview).length;
  const isRunning = runState === "running";

  return (
    <div className="flex items-center gap-5 px-5 py-3 shrink-0 bg-black/[0.02] dark:bg-white/[0.02] border-b-[0.5px] border-black/5 dark:border-white/[0.06]">
      <div className="flex items-center gap-1.5">
        <ArrowRight className="w-3 h-3 text-muted-foreground dark:text-[var(--tidy-secondary-label)]" />
        <span className="text-[14px] text-foreground dark:text-foreground font-medium">{files.length}</span>
        <span className="text-[12px] text-muted-foreground dark:text-[var(--tidy-secondary-label)]">to move</span>
      </div>
      {renameCount > 0 && (
        <div className="flex items-center gap-1.5">
          <Copy className="w-3 h-3 text-muted-foreground dark:text-[var(--tidy-secondary-label)]" />
          <span className="text-[14px] text-foreground dark:text-foreground font-medium">{renameCount}</span>
          <span className="text-[12px] text-muted-foreground dark:text-[var(--tidy-secondary-label)]">to rename</span>
        </div>
      )}
      {reviewCount > 0 && (
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-[var(--system-orange)]" />
          <span className="text-[14px] text-[var(--system-orange)] font-medium">{reviewCount}</span>
          <span className="text-[12px] text-[var(--system-orange)]">needs review</span>
        </div>
      )}

      {isRunning && (
        <div className="ml-auto w-32 flex flex-col gap-1.5">
          <div className="flex justify-between text-[12px] font-semibold">
            <span className="text-muted-foreground dark:text-[var(--tidy-secondary-label)]">Progress</span>
            <span className="text-[var(--system-blue)]">{Math.round(progress)}%</span>
          </div>
          <div className="h-1 rounded-full bg-black/5 dark:bg-white/[0.06] overflow-hidden">
            <motion.div className="h-full bg-[var(--system-blue)]" initial={{ width: 0 }} animate={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function CompletionView({ metrics, onClose, runState, onUndo }: { metrics: RunMetrics; onClose: () => void; runState: RunState; onUndo: (operations: Operation[]) => Promise<boolean | undefined> }) {
  const isError = runState === "error";
  const [undoStatus, setUndoStatus] = useState<"idle" | "undoing" | "done">("idle");

  const handleUndo = async () => {
    if (!window.electron || !metrics.operations || metrics.operations.length === 0) return;
    setUndoStatus("undoing");
    if (await onUndo(metrics.operations)) {
      setUndoStatus("done");
    } else {
      setUndoStatus("idle");
    }
  };

  const handleOpenDest = async () => {
    if (window.electron && metrics.destPath) {
      await window.electron.openFolder(metrics.destPath);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-8 overflow-y-auto">
      <div className="flex flex-col items-center justify-center shrink-0 mb-8">
        {isError ? (
          <AlertTriangle className="w-16 h-16 text-[var(--system-red)] mb-6 drop-shadow-[0_4px_12px_rgba(255,59,48,0.25)]" />
        ) : (
          <CheckCircle2 className="w-16 h-16 text-[var(--system-green)] mb-6 drop-shadow-[0_4px_12px_rgba(52,199,89,0.25)]" />
        )}

        <h2 className="text-[20px] font-semibold text-foreground dark:text-foreground mb-2">
          {undoStatus === "done" ? "Undo Complete" : isError ? "Something went wrong" : "Tidy Complete!"}
        </h2>
        <p className="text-[14px] text-muted-foreground dark:text-[var(--tidy-secondary-label)] mb-6 text-center max-w-[280px]">
          {undoStatus === "done" ? "Tidy reversed the recorded changes." : isError ? "Some files could not be processed."
            : metrics.operations?.length ? "You can undo the recorded changes below." : "Tidy finished organizing your files."}
          {Boolean(metrics.trashed) && ` ${metrics.trashed} duplicate(s) went to Trash. Use Put Back in Finder to recover them.`}
        </p>

        {!isError && undoStatus !== "done" && (
          <div className="grid grid-cols-2 gap-4 w-full max-w-[320px] mb-8">
            <div className="p-4 rounded-lg bg-black/5 dark:bg-white/[0.03] border border-black/10 dark:border-white/[0.06] flex flex-col items-center">
              <span className="text-[24px] font-semibold text-foreground dark:text-foreground leading-none">{metrics.tagged || metrics.moved}</span>
              <span className="text-[12px] text-muted-foreground dark:text-[var(--tidy-secondary-label)] font-semibold mt-2 px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/[0.04]">{metrics.tagged ? "Tagged" : "Moved"}</span>
            </div>
            <div className="p-4 rounded-lg bg-black/5 dark:bg-white/[0.03] border border-black/10 dark:border-white/[0.06] flex flex-col items-center">
              <span className="text-[24px] font-semibold text-foreground dark:text-foreground leading-none">{metrics.renamed}</span>
              <span className="text-[12px] text-muted-foreground dark:text-[var(--tidy-secondary-label)] font-semibold mt-2 px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/[0.04]">Renamed</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {undoStatus !== "done" && (
          <div className="flex items-center gap-3">
            {metrics.operations && metrics.operations.length > 0 && (
              <button
                onClick={handleUndo}
                disabled={undoStatus !== "idle"}
                className="px-6 py-2.5 rounded-full bg-black/5 dark:bg-white/[0.05] border border-black/10 dark:border-white/[0.1] text-[var(--tidy-secondary-label)] dark:text-foreground text-[14px] font-medium hover:bg-black/10 dark:hover:bg-white/[0.1] hover:text-foreground dark:hover:text-white active:scale-95 transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)]"
              >
                {undoStatus === "undoing" ? "Undoing..." : "Undo Changes"}
              </button>
            )}
            {metrics.destPath && (
              <button
                onClick={handleOpenDest}
                className="px-6 py-2.5 rounded-full bg-[var(--system-blue)] text-[var(--accent-text)] text-[14px] font-semibold hover:opacity-90 active:scale-95 transition-all shadow-[0_4px_12px_rgba(10,132,255,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)] focus-visible:ring-offset-2"
              >
                Open Destination
              </button>
            )}
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-full bg-black/5 dark:bg-white/[0.05] border border-black/10 dark:border-white/[0.1] text-foreground dark:text-foreground text-[14px] font-semibold hover:bg-black/10 dark:hover:bg-white/[0.10] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)]"
            >
              Done
            </button>
          </div>
        )}

        {undoStatus === "done" && (
          <button
            onClick={onClose}
            className="px-8 py-3 rounded-full bg-black/5 dark:bg-white/[0.05] border border-black/10 dark:border-white/[0.1] text-foreground dark:text-foreground text-[14px] font-semibold hover:bg-black/10 dark:hover:bg-white/[0.10] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)]"
          >
            Done
          </button>
        )}
      </div>

      {/* Operations List */}
      {!isError && undoStatus !== "done" && metrics.operations && metrics.operations.length > 0 && (
        <div className="flex-1 mt-4 max-w-2xl mx-auto w-full">
          <h3 className="text-[14px] text-muted-foreground dark:text-[var(--tidy-secondary-label)] font-semibold mb-3">Operations Recap</h3>
          <div className="flex flex-col gap-2 relative z-0">
            {metrics.operations.map((op, i) => {
              const ext = op.originalName.split('.').pop() || '';
              const iconColorCls = "text-muted-foreground dark:text-[var(--tidy-secondary-label)]"; // Default

              return (
                <div key={i} className="flex items-center p-3 rounded-lg bg-black/5 dark:bg-white/[0.02] border border-black/10 dark:border-white/[0.04] group hover:bg-black/10 dark:hover:bg-white/[0.04] transition-colors relative">
                  <div className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/[0.06] flex items-center justify-center shrink-0 mr-3 border border-black/5 dark:border-white/[0.08]">
                    <span className={`text-[12px] font-semibold   ${iconColorCls}`}>
                      {ext.substring(0, 3)}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[14px] text-foreground dark:text-foreground font-medium truncate" title={op.originalName}>
                        {op.originalName}
                      </span>
                    </div>
                    {op.originalName !== op.newName ? (
                      <div className="flex items-center gap-1.5">
                        <ArrowRight className="w-3 h-3 text-[var(--system-green)] shrink-0" />
                        <span className="text-[12px] text-[var(--system-green)] truncate font-mono bg-[var(--system-green)]/10 px-1 rounded-sm" title={op.newName}>{op.newName}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] text-muted-foreground dark:text-[var(--tidy-secondary-label)] truncate" title="No rename">No rename</span>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center pl-2 ml-auto border-l-[0.5px] border-black/10 dark:border-white/[0.06]">
                    <p className="text-[12px] text-muted-foreground dark:text-[var(--tidy-secondary-label)] font-mono w-[180px] truncate text-right px-2" title={op.newPath.replace(metrics.destPath || '', '')}>
                      {op.newPath.replace(metrics.destPath || '', '')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BottomBar({ onClose, onConfirm, isRunning, empty }: { onClose: () => void; onConfirm: () => void; isRunning: boolean; empty: boolean }) {
  return (
    <div className="px-5 py-4 shrink-0 flex items-center justify-between bg-black/5 dark:bg-black/20 border-t-[0.5px] border-black/10 dark:border-white/[0.06]">
      <button onClick={onClose} disabled={isRunning}
        className="px-4 py-2 rounded-lg text-[14px] text-muted-foreground dark:text-[var(--tidy-secondary-label)] hover:text-foreground dark:hover:text-foreground transition-colors disabled:opacity-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)]">
        Cancel
      </button>
      <button onClick={onConfirm} disabled={isRunning || empty}
        className="px-6 py-2.5 rounded-full bg-[var(--system-blue)] text-[var(--accent-text)] text-[14px] font-semibold hover:opacity-90 active:scale-95 transition-all shadow-[0_4px_12px_rgba(0,122,255,0.3)] disabled:opacity-20 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--system-blue)]">
        <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
        {isRunning ? "Running..." : "Confirm & Run"}
      </button>
    </div>
  );
}

// ─── PreviewSheet (main export) ───────────────────────────────────────────────

export interface PreviewSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (sheetData?: { renames?: Record<string, AcceptedRename> }) => void;
  onUndo: (operations: Operation[]) => Promise<boolean | undefined>;
  categories: Category[];
  runState: RunState;
  runMetrics: RunMetrics;
  runProgress: number;
  files: PreviewFile[];
  smartRenameEnabled?: boolean;
  organizationMode?: OrganizationMode;
  conflictResolution?: ConflictResolution;
}

export function PreviewSheet({
  isOpen, onClose, onConfirm, onUndo, categories,
  runState, runMetrics, runProgress, files = [],
  smartRenameEnabled = false,
  organizationMode = "move", conflictResolution = "rename",
}: PreviewSheetProps) {
  const [acceptedRenames, setAcceptedRenames] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (files.length > 0) {
      const init: Record<string, boolean> = {};
      files.forEach(f => {
        if (f.smartRename) init[f.id] = f.smartRename.confidence === "high";
      });
      setAcceptedRenames(init);
    }
  }, [files]);

  const enabledIds = useMemo(() => new Set(categories.filter(c => c.enabled).map(c => c.id)), [categories]);
  const visibleFiles = useMemo(() => files.filter(f => enabledIds.has(f.categoryId ?? f.category)), [files, enabledIds]);

  const duplicateFiles = useMemo(() => visibleFiles.filter(f => f.isDuplicate), [visibleFiles]);
  const nonDuplicateFiles = useMemo(() => visibleFiles.filter(f => !f.isDuplicate), [visibleFiles]);

  const regularFiles = useMemo(() => nonDuplicateFiles.filter(f => !f.smartRename || f.smartRename.confidence === "high"), [nonDuplicateFiles]);
  const reviewFiles = useMemo(() => nonDuplicateFiles.filter(f => f.smartRename && (f.smartRename.confidence === "medium" || f.smartRename.confidence === "low")), [nonDuplicateFiles]);

  const acceptedRenameCount = useMemo(
    () => files.filter(f => f.smartRename && acceptedRenames[f.id]).length,
    [files, acceptedRenames]
  );

  const isRunning = runState === "running";
  const isDone = runState === "completed" || runState === "error";

  const toggleAccept = (id: string) => setAcceptedRenames(p => ({ ...p, [id]: !p[id] }));

  const applyAll = () => {
    const next: Record<string, boolean> = {};
    files.forEach(f => { if (f.smartRename) next[f.id] = true; });
    setAcceptedRenames(p => ({ ...p, ...next }));
  };
  const revertAll = () => {
    const next: Record<string, boolean> = {};
    files.forEach(f => { if (f.smartRename) next[f.id] = false; });
    setAcceptedRenames(p => ({ ...p, ...next }));
  };

  const confirmAndRun = () => {
    const renamesToApply: Record<string, AcceptedRename> = {};
    files.forEach(f => {
      if (f.smartRename && acceptedRenames[f.id]) {
        renamesToApply[f.relativePath ?? f.name] = {
          suggested: smartRenameEnabled ? f.smartRename.suggested : f.name,
          confidence: f.smartRename.confidence || "high",
          subfolder: f.smartRename.subfolder,
          source: f.smartRename.source,
          contentYear: f.smartRename.contentYear,
        };
      }
    });
    onConfirm({ renames: renamesToApply });
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={open => { if (!open && !isRunning) onClose(); }}><AnimatePresence>
      {isOpen && (
        <Dialog.Portal forceMount>
          <Dialog.Overlay asChild>
          <motion.div key="bd"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[55]"
            style={{ background: "rgba(0,0,0,0.36)" }}
          />
          </Dialog.Overlay>
          <Dialog.Content asChild onEscapeKeyDown={event => { if (isRunning) event.preventDefault(); }} onPointerDownOutside={event => { if (isRunning) event.preventDefault(); }}>
          <motion.div key="sh"
            initial={{ x: "100%" }} animate={{ x: "0%" }} exit={{ x: "100%" }}
            transition={{ duration: 0.25, ease: [0, 0, 0, 1] }}
            role="dialog"
            aria-label="Preview Changes"
            aria-modal="true"
            className="fixed top-0 right-0 bottom-0 z-[60] flex flex-col w-full md:w-[520px] lg:w-[600px] bg-card backdrop-blur-3xl backdrop-saturate-150 border-l-[0.5px] border-black/10 dark:border-white/[0.08]"
            style={{
              fontFamily: "var(--font-ui)",
            }}
          >
            <div className="flex items-center justify-between px-5 py-4 shrink-0 border-b-[0.5px] border-black/5 dark:border-white/[0.07]">
              <div>
                <Dialog.Title asChild><h2 className="text-[20px] font-semibold text-foreground">Preview Changes</h2></Dialog.Title>
                <Dialog.Description asChild><p className="text-[12px] text-muted-foreground mt-0.5">Review before organizing</p></Dialog.Description>
              </div>
              <button onClick={onClose} disabled={isRunning}
                aria-label="Close preview"
                className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--tidy-secondary-label)] dark:text-[var(--tidy-secondary-label)] hover:text-foreground dark:hover:text-foreground hover:bg-black/5 dark:hover:bg-white/[0.08] transition-colors disabled:opacity-18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)]">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <SummaryStrip
              files={visibleFiles} runState={runState} progress={runProgress}
              smartRenameEnabled={smartRenameEnabled} acceptedRenameCount={acceptedRenameCount}
            />

            {isDone ? (
              <CompletionView metrics={runMetrics} onClose={onClose} runState={runState} onUndo={onUndo} />
            ) : (
              <>
                {isRunning && <RunningMessage />}
                <div className="flex-1 overflow-auto">
                  {visibleFiles.length === 0 && <p role="status" className="px-5 py-8 text-[14px] text-muted-foreground">No files match your enabled rules and filters. Change the rules or choose another source folder.</p>}
                  {files.length >= 50 && <p className="px-5 py-3 text-[14px] text-muted-foreground">Preview shows the first 50 matching files. This run will process all matching files in the source folder; AI suggestions apply only to the files shown.</p>}
                  <ColHeaders />

                  {visibleFiles.some(file => file.smartRename) && (
                    <BulkRenameBar
                      files={visibleFiles}
                      onApplyAll={applyAll}
                      onRevertAll={revertAll}
                      smartRenameEnabled={smartRenameEnabled}
                    />
                  )}

                  <div className="flex flex-col flex-1 pb-20">

                    {/* Duplicates Section */}
                    {duplicateFiles.length > 0 && (
                      <div className="mb-4">
                        <div className="px-5 py-2 mt-2 bg-[var(--system-red)]/10 border-y border-[var(--system-red)]/20 flex items-center justify-between">
                          <span className="text-[12px] font-semibold text-[var(--system-red)] flex items-center gap-1.5">
                            <Copy className="w-3.5 h-3.5" />
                            Exact Duplicates ({duplicateFiles.length})
                          </span>
                          <span className="text-[12px] text-[var(--system-red)]">Matching full-file hashes</span>
                        </div>
                        <div className="divide-y divide-white/[0.04]">
                          {duplicateFiles.map((file) => (
                            <FileRow
                              key={file.id} file={file}
                              organizationMode={organizationMode}
                              trashDuplicate={conflictResolution === "trash"}
                              smartRenameEnabled={false}
                              dimmed={isRunning}
                              categoryConfig={categories.find(c => c.name.toLowerCase() === file.category.toLowerCase())}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {reviewFiles.length > 0 && (
                      <div className="mb-4">
                        <div className="px-5 py-2 mt-2 bg-[var(--system-orange)]/10 border-y border-[var(--system-orange)]/20 flex items-center justify-between">
                          <span className="text-[12px] font-semibold text-[var(--system-orange)] flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Review Required ({reviewFiles.length})
                          </span>
                          <span className="text-[12px] text-[var(--system-orange)]">Check suggestions below</span>
                        </div>
                        <div className="divide-y divide-white/[0.04]">
                          {reviewFiles.map((file) => (
                            <FileRow
                              key={file.id} file={file}
                              organizationMode={organizationMode}
                              smartRenameEnabled={smartRenameEnabled}
                              accepted={acceptedRenames[file.id]}
                              onToggleAccept={toggleAccept}
                              dimmed={isRunning}
                              categoryConfig={categories.find(c => c.name.toLowerCase() === file.category.toLowerCase())}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {regularFiles.length > 0 && (
                      <div>
                        {reviewFiles.length > 0 && (
                          <div className="px-5 py-2 bg-white/[0.02] border-y border-white/[0.04]">
                            <span className="text-[12px] font-semibold text-foreground">
                              Ready to Organize ({regularFiles.length})
                            </span>
                          </div>
                        )}
                        <div className="divide-y divide-white/[0.04]">
                          {regularFiles.map((file) => (
                            <FileRow
                              key={file.id} file={file}
                              organizationMode={organizationMode}
                              smartRenameEnabled={smartRenameEnabled}
                              accepted={acceptedRenames[file.id]}
                              onToggleAccept={toggleAccept}
                              dimmed={isRunning}
                              categoryConfig={categories.find(c => c.name.toLowerCase() === file.category.toLowerCase())}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <BottomBar
                  onClose={onClose}
                  onConfirm={confirmAndRun}
                  isRunning={isRunning}
                  empty={visibleFiles.length === 0}
                />
              </>
            )}
          </motion.div>
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </AnimatePresence></Dialog.Root>
  );
}
