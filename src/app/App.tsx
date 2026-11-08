import { useInertHiddenLayers } from "./hooks/useInertHiddenLayers";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Toaster } from "sonner";

import { AccessibilityPanel } from "./components/AccessibilityPanel";
import { AuditLogSidebar, AuditLogToggleButton } from "./components/AuditLogSidebar";
import { BottomPanel } from "./components/BottomPanel";
import { InsightsSidebar, InsightsToggleButton } from "./components/InsightsSidebar";
import { NaturalLanguageRuleBuilder } from "./components/NaturalLanguageRuleBuilder";
import { NoticeDialog } from "./components/NoticeDialog";
import { OrganizedFileSearch } from "./components/OrganizedFileSearch";
import { Search } from "./components/icons";
import { PreviewSheet } from "./components/PreviewSheet";
import { StatusBar, type RunState } from "./components/StatusBar";
import { TopBar } from "./components/TopBar";
import { AiCommandBar } from "./components/sections/AiCommandBar";
import { AiRuleReviewDialog, type AiRuleReview } from "./components/AiRuleReviewDialog";
import { FiltersSection } from "./components/sections/FiltersSection";
import { LocationsSection } from "./components/sections/LocationsSection";
import { RulesSection } from "./components/sections/RulesSection";

import { useAppShortcuts } from "./hooks/useAppShortcuts";
import { useCategoryRules } from "./hooks/useCategoryRules";
import { useFolderInsights } from "./hooks/useFolderInsights";
import { useMenuActions } from "./hooks/useMenuActions";
import { useOrganizerRun } from "./hooks/useOrganizerRun";
import { usePersistentState } from "./hooks/usePersistentState";
import { useFullScreen } from "./hooks/useSystemAppearance";

import { initialRuleQuestion, prepareRuleDraft, readRuleResponse, type ClarificationTurn } from "./lib/ruleReview";
import { normalizeNamingStyle, type NamingStyle, type RenameEngine } from "../shared/naming";
import { isDateFilter, isOlderDays } from "../shared/dateFilters";
import { buildInsightGroups } from "./lib/insights";
import { STORAGE_KEYS } from "./constants";
import type { AiFeedback, ConflictResolution, Filters, MetadataGrouping, OrganizationMode, OrganizerConfig, ScheduleType } from "./types";

const DEFAULT_FILTERS: Filters = {
  dateModified: "any",
  fileSize: "any",
  excludeHidden: false,
};

/** How long a transient AI status message stays on screen, in milliseconds. */
const AI_FEEDBACK_TIMEOUT = { success: 4000, running: 5000 } as const;
const SUBFOLDER_CODEC = { parse: (raw: string) => raw === "true", stringify: (value: boolean) => String(value) };
type SourceSelection = {source: string; folders: string[] | null; types: string[] | null};
const SOURCE_SELECTION_CODEC = {
  parse: (raw: string): SourceSelection => {
    const value = JSON.parse(raw);
    const valid = (items: unknown) => items === null || (Array.isArray(items) && items.every(item => typeof item === "string"));
    if (typeof value?.source !== "string" || !valid(value.folders) || !valid(value.types)) throw new Error("Invalid source selection");
    return value;
  },
  stringify: (value: SourceSelection) => JSON.stringify(value),
};
const NAMING_STYLE_CODEC = { parse: normalizeNamingStyle, stringify: (style: NamingStyle) => style };
const FILTERS_CODEC = {
  parse: (raw: string): Filters => {
    const filters = JSON.parse(raw);
    if (!isDateFilter(filters?.dateModified) ||
        (filters.dateModified === "older" && !isOlderDays(filters.olderThanDays)) ||
        !["any", "small", "medium", "large"].includes(filters.fileSize) ||
        typeof filters.excludeHidden !== "boolean") throw new Error("Invalid filters");
    return filters;
  },
  stringify: JSON.stringify,
};
const SCHEDULE_DATE_CODEC = {
  parse: (raw: string) => {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new Error("Invalid schedule date");
    return date;
  },
  stringify: (date: Date | undefined) => date?.toISOString() ?? "",
};

/**
 * Tidy's root view.
 *
 * `App` owns the settings the user edits directly and composes them into an
 * `OrganizerConfig`. The behaviour built on top of that config — previewing,
 * running, undoing, reacting to menus and shortcuts — lives in the hooks under
 * `./hooks`, and the screen is assembled from the sections under
 * `./components/sections`.
 */
export default function App() {
  useInertHiddenLayers();
  // ─── Locations ──────────────────────────────────────────────────────────────
  const [sourcePath, setSourcePath] = usePersistentState(STORAGE_KEYS.sourcePath, "");
  const [destPath, setDestPath] = usePersistentState(STORAGE_KEYS.destPath, "");

  const [includeSubfolders, setIncludeSubfolders] = usePersistentState(STORAGE_KEYS.includeSubfolders, false, SUBFOLDER_CODEC);

  const [sourceSelection, setSourceSelection] = usePersistentState<SourceSelection>("tidy_source_selection", {source: "", folders: null, types: null}, SOURCE_SELECTION_CODEC);
  const selectedSourceFolders = includeSubfolders && sourceSelection.source === sourcePath ? sourceSelection.folders : null;
  const selectedFileExtensions = includeSubfolders && sourceSelection.source === sourcePath ? sourceSelection.types : null;
  const changeSelection = (folders: string[] | null, types: string[] | null) => setSourceSelection({source: sourcePath, folders, types});

  // ─── Rules, filters, and policy ─────────────────────────────────────────────
  const rules = useCategoryRules();
  const { categories, setCategories } = rules;
  const [filters, setFilters] = usePersistentState<Filters>("tidy_filters", DEFAULT_FILTERS, FILTERS_CODEC);
  const [conflictResolution, setConflictResolution] = usePersistentState<ConflictResolution>("tidy_conflict_resolution", "rename");
  const [scheduleType, setScheduleType] = usePersistentState<ScheduleType>("tidy_schedule_type", "manual");
  const [scheduleTime, setScheduleTime] = usePersistentState("tidy_schedule_time", "09:00");
  const [scheduleDate, setScheduleDate] = usePersistentState<Date | undefined>("tidy_schedule_date", undefined, SCHEDULE_DATE_CODEC);
  const [watchEnabled, setWatchEnabled] = usePersistentState("tidy_watch_source", false, SUBFOLDER_CODEC);
  const [organizationMode, setOrganizationMode] = usePersistentState<OrganizationMode>("tidy_organization_mode", "move");
  const [metadataGrouping, setMetadataGrouping] = usePersistentState<MetadataGrouping>("tidy_metadata_grouping", "none");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [smartRenameEnabled, setSmartRenameEnabled] = useState(false);
  const [renameEngine, setRenameEngine] = usePersistentState<RenameEngine>("tidy_rename_engine", "gemini");
  const [namingStyle, setNamingStyle] = usePersistentState<NamingStyle>(STORAGE_KEYS.namingStyle, "descriptive", NAMING_STYLE_CODEC);

  // ─── Chrome: search, panels, notices ────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [fileSearchFolder, setFileSearchFolder] = useState<string | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  const [ruleBuilderOpen, setRuleBuilderOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const showNotice = useCallback((message: string) => setNotice(message), []);

  // ─── AI command bar ─────────────────────────────────────────────────────────
  const [aiQuery, setAiQuery] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<AiFeedback | null>(null);
  const [aiReview, setAiReview] = useState<AiRuleReview | null>(null);
  const [aiReviewError, setAiReviewError] = useState<string | null>(null);

  const isFullScreen = useFullScreen();

  /** Everything a run needs, derived from the settings above. */
  const config: OrganizerConfig = useMemo(
    () => ({
      sourcePath,
      destPath,
      includeSubfolders,
      selectedSourceFolders,
      selectedFileExtensions,
      categories,
      filters,
      conflictResolution,
      watchEnabled,
      organizationMode,
      metadataGrouping,
      schedule: {
        enabled: scheduleType !== "manual",
        frequency: scheduleType,
        date: scheduleDate ?? null,
        time: scheduleTime,
      },
    }),
    [
      sourcePath,
      destPath,
      includeSubfolders,
      selectedSourceFolders,
      selectedFileExtensions,
      categories,
      filters,
      conflictResolution,
      watchEnabled,
      organizationMode,
      metadataGrouping,
      scheduleType,
      scheduleDate,
      scheduleTime,
    ],
  );

  const run = useOrganizerRun({
    config,
    smartRenameEnabled,
    namingStyle,
    renameEngine,
    onNotice: showNotice,
  });

  // Wait for persisted settings before syncing so reopening Tidy cannot clear
  // the saved background schedule with the renderer's initial defaults.
  useEffect(() => setSettingsLoaded(true), []);
  useEffect(() => window.electron?.onAutomationNotice(showNotice), [showNotice]);
  useEffect(() => {
    if (!settingsLoaded || !window.electron?.saveSchedule) return;
    let active = true;
    void window.electron.saveSchedule(config).then(result => {
      if (active && !result.success) showNotice(result.error ?? "Tidy could not save the schedule.");
    }).catch(() => {
      if (active) showNotice("Tidy could not save the schedule.");
    });
    return () => { active = false; };
  }, [config, settingsLoaded, showNotice]);

  const insightData = useFolderInsights(sourcePath, includeSubfolders, organizationMode === "tags" ? "" : destPath, selectedSourceFolders, selectedFileExtensions);
  const { startPreview } = run;
  const insights = useMemo(
    () =>
      buildInsightGroups({
        data: insightData,
        categories,
        onReview: () => void startPreview(),
      }),
    [insightData, categories, startPreview],
  );

  /** Category ids matching the search box, or null when the search is empty. */
  const searchMatches = useMemo<Set<string> | null>(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return null;
    return new Set(
      categories
        .filter(
          (category) =>
            category.name.toLowerCase().includes(query) ||
            category.extensions.some((extension) => extension.toLowerCase().includes(query)),
        )
        .map((category) => category.id),
    );
  }, [searchQuery, categories]);

  const browseForFolder = useCallback(async (): Promise<string | null> => {
    if (!window.electron) return null;
    try {
      return await window.electron.openDirectory();
    } catch {
      showNotice("Could not open the folder picker.");
      return null;
    }
  }, [showNotice]);

  const resetRules = useCallback(() => {
    rules.reset();
    setFilters(DEFAULT_FILTERS);
    setSearchQuery("");
  }, [rules]);

  /** Parsing only prepares a draft. Settings and schedules stay untouched here. */
  const proposeAiRule = useCallback(async (instruction: string, origin: "inline" | "builder", turns: ClarificationTurn[] = []) => {
    setAiBusy(true);
    setAiFeedback(null);
    setAiReviewError(null);
    try {
      const initialQuestion = turns.length === 0 ? initialRuleQuestion(instruction) : null;
      if (initialQuestion) {
        setAiReview({ kind: "question", instruction, origin, turns, question: initialQuestion });
        return;
      }
      if (!window.electron?.parseRule) throw new Error("AI rules are only available in the desktop app.");
      const result = await window.electron.parseRule(instruction, { categories, filters, smartRenameEnabled, sourcePath, destPath, includeSubfolders, clarifications: turns });
      if (!result.success || !result.data) throw new Error(result.error || "AI couldn't process that. Try rephrasing.");
      const patch = readRuleResponse(result.data);
      const question = patch.clarification?.trim();
      if (question) {
        setAiReview({ kind: "question", instruction, origin, turns, question: question.slice(0, 1000) });
      } else {
        setAiReview({ kind: "draft", instruction, origin, turns, draft: prepareRuleDraft(config, smartRenameEnabled, patch, namingStyle) });
      }
    } finally {
      setAiBusy(false);
    }
  }, [categories, filters, smartRenameEnabled, sourcePath, destPath, includeSubfolders, config, namingStyle]);

  const submitAiQuery = useCallback(async () => {
    if (!aiQuery.trim() || aiBusy) return;
    try { await proposeAiRule(aiQuery.trim(), "inline"); }
    catch (error) { setAiFeedback({ type: "error", message: error instanceof Error ? error.message : "Couldn't reach AI. Please try again." }); }
  }, [aiQuery, aiBusy, proposeAiRule]);

  async function proposeFolderRules() {
    if (!sourcePath || aiBusy) return;
    setAiBusy(true);
    setAiReviewError(null);
    try {
      const result = await window.electron?.suggestFolderRules(sourcePath, {
        includeSubfolders, selectedSourceFolders,
        destPath: organizationMode === "move" ? destPath : undefined,
      });
      if (!result?.success || !result.data) throw new Error(result?.error || "Folder rule suggestions are available in the desktop app.");
      const { newCategories } = readRuleResponse(result.data);
      if (!newCategories?.length) throw new Error("Gemini did not return a usable rule set.");
      const byName = new Map(newCategories.map(category => [category.name?.toLowerCase(), category]));
      const updateCategories = categories.map(({ id, name }) => {
        const proposed = byName.get(name.toLowerCase());
        byName.delete(name.toLowerCase());
        return proposed ? { ...proposed, id, enabled: true } : { id, enabled: false };
      });
      const draft = prepareRuleDraft(config, smartRenameEnabled, {
        newCategories: [...byName.values()],
        updateCategories,
      }, namingStyle);
      setAiReview({ kind: "draft", origin: "folder", turns: [], draft,
        instruction: `Suggested rules from ${result.sampleCount ?? 0} filenames. File contents were not shared.` });
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Tidy could not suggest folder rules.");
    } finally {
      setAiBusy(false);
    }
  }

  function openFileSearch() {
    const folder = organizationMode === "tags" ? sourcePath : destPath;
    if (!folder) {
      showNotice(organizationMode === "tags" ? "Choose the folder you tagged before searching." : "Choose the organized destination folder before searching.");
      return;
    }
    setFileSearchFolder(folder);
  }

  const confirmAiRule = () => {
    if (aiReview?.kind !== "draft" || aiBusy) return;
    const { draft, origin } = aiReview;
    setCategories(draft.config.categories);
    setFilters(draft.config.filters);
    setSourcePath(draft.config.sourcePath);
    setDestPath(draft.config.destPath);
    setSmartRenameEnabled(draft.smartRenameEnabled);
    setIncludeSubfolders(draft.config.includeSubfolders === true);
    setAiReview(null);
    setAiQuery("");
    setAiFeedback({ type: "success", message: "Reviewed rules applied." });
    window.setTimeout(() => setAiFeedback(null), AI_FEEDBACK_TIMEOUT.success);
    if (origin === "inline" && draft.openPreview && draft.config.sourcePath) void startPreview(draft.config.sourcePath, draft.config, draft.smartRenameEnabled);
  };

  const clarifyAiRule = async (answer: string) => {
    if (aiReview?.kind !== "question" || aiBusy) return;
    if (aiReview.origin === "folder") return;
    try { await proposeAiRule(aiReview.instruction, aiReview.origin, [...aiReview.turns, { question: aiReview.question, answer }]); }
    catch (error) { setAiReviewError(error instanceof Error ? error.message : "Couldn't reach AI. Your settings haven't changed."); }
  };

  const operations = run.runMetrics.operations ?? [];
  const anyPanelOpen =
    run.previewOpen || ruleBuilderOpen || aiReview !== null || insightsOpen || auditLogOpen || notice !== null || fileSearchFolder !== null;

  useMenuActions({
    "open-preferences": () => window.dispatchEvent(new CustomEvent("tidy:open-preferences")),
    "run-tidy": () => void startPreview(),
    "reset-rules": resetRules,
    "open-source": () => void browseForFolder().then((dir) => dir && setSourcePath(dir)),
    "open-destination": () => void browseForFolder().then((dir) => dir && setDestPath(dir)),
    "toggle-insights": () => setInsightsOpen((open) => !open),
    "toggle-audit": () => setAuditLogOpen((open) => !open),
    "clear-search": () => {
      setSearchQuery("");
      setSearchOpen(false);
    },
    "undo-organize": () => void run.undo(operations),
  });

  useAppShortcuts(
    {
      onRun: () => void startPreview(),
      onUndo: () => void run.undo(operations),
    },
    { isModalOpen: anyPanelOpen, canUndo: operations.length > 0 },
  );

  return (
    <div
      className="tidy-app h-screen overflow-hidden relative selection:bg-[var(--system-blue)]/30 selection:text-white bg-[var(--tidy-window-background)] text-foreground"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <a href="#main-content" className="skip-to-main">
        Skip to main content
      </a>

      <LiveRegion
        runState={run.runState}
        runProgress={run.runProgress}
        metrics={run.runMetrics}
        aiBusy={aiBusy}
        aiFeedback={aiFeedback}
      />

      <div className="absolute top-0 left-0 right-0 z-30">
        <TopBar
          title="Tidy"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
          runState={run.runState}
          progress={run.runProgress}
          onRunTidy={() => void startPreview()}
          isFullScreen={isFullScreen}
        >
          <AccessibilityPanel isCompact />
          <button type="button" className="tidy-icon-button" title="Find organized files" aria-label="Find organized files" onClick={openFileSearch}>
            <Search className="w-4 h-4" aria-hidden="true" />
          </button>
          <AuditLogToggleButton
            isOpen={auditLogOpen}
            onClick={() => setAuditLogOpen(!auditLogOpen)}
            isCompact
          />
          <InsightsToggleButton
            isOpen={insightsOpen}
            onClick={() => setInsightsOpen(!insightsOpen)}
            isCompact
          />
        </TopBar>

        <RunProgressBar runState={run.runState} progress={run.runProgress} />
      </div>

      <main
        id="main-content"
        tabIndex={0}
        className="h-full w-full overflow-auto scroll-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--tidy-focus-ring)]"
      >
        {/* Top padding clears the floating top bar; bottom padding clears the status bar. */}
        <div className="tidy-page">
          <div className="tidy-page-intro"><h1>Organize files</h1><p>Choose your folders, set your rules, and preview changes before you run.</p></div>
          <LocationsSection
            sourcePath={sourcePath}
            destPath={destPath}
            tagOnly={organizationMode === "tags"}
            includeSubfolders={includeSubfolders}
            onIncludeSubfoldersChange={setIncludeSubfolders}
            selectedSourceFolders={selectedSourceFolders}
            selectedFileExtensions={selectedFileExtensions}
            onSelectionChange={changeSelection}
            fileExtensions={[...new Set(categories.filter(c => c.enabled).flatMap(c => c.extensions))].sort((a, b) => { const common = ["pdf", "docx", "txt", "jpg", "png", "mp3", "mp4", "zip"]; const rank = (ext: string) => common.includes(ext) ? common.indexOf(ext) : common.length; return rank(a) - rank(b) || a.localeCompare(b); })}
            excludeHidden={filters.excludeHidden}
            onSourceChange={setSourcePath}
            onDestChange={setDestPath}
            onBrowse={browseForFolder}
          />

          <Divider />

          <FiltersSection filters={filters} onChange={setFilters} />

          <Divider />

          <RulesSection
            categories={categories}
            expandedIds={rules.expandedIds}
            enabledCount={rules.enabledCount}
            searchMatches={searchMatches}
            searchQuery={searchQuery}
            smartRenameEnabled={smartRenameEnabled}
            namingStyle={namingStyle}
            onNamingStyleChange={setNamingStyle}
            renameEngine={renameEngine}
            onRenameEngineChange={setRenameEngine}
            onSmartRenameToggle={() => setSmartRenameEnabled((enabled) => !enabled)}
            onToggleFeatureForAll={rules.toggleFeatureForAll}
            onToggleExpanded={rules.toggleExpanded}
            onPatchCategory={rules.updateCategory}
            onToggleExtension={rules.toggleExtension}
            onSuggestFolderRules={() => void proposeFolderRules()}
            canSuggestFolderRules={Boolean(sourcePath) && !aiBusy}
          />

          <AiCommandBar
            value={aiQuery}
            onValueChange={(value) => {
              setAiQuery(value);
              setAiFeedback(null);
            }}
            onSubmit={() => void submitAiQuery()}
            busy={aiBusy}
            feedback={aiFeedback}
            onOpenAdvanced={() => setRuleBuilderOpen(true)}
          />

          <Divider />

          <BottomPanel
            scheduleType={scheduleType}
            onScheduleTypeChange={setScheduleType}
            scheduleTime={scheduleTime}
            onScheduleTimeChange={setScheduleTime}
            scheduleDate={scheduleDate ?? null}
            onScheduleDateChange={setScheduleDate}
            conflictResolution={conflictResolution}
            onConflictResolutionChange={setConflictResolution}
            watchEnabled={watchEnabled}
            onWatchEnabledChange={setWatchEnabled}
            organizationMode={organizationMode}
            onOrganizationModeChange={setOrganizationMode}
            metadataGrouping={metadataGrouping}
            onMetadataGroupingChange={setMetadataGrouping}
          />
        </div>
      </main>

      <footer className="tidy-status">
        <StatusBar runState={run.runState} metrics={run.runMetrics} logEvents={run.logEvents} />
      </footer>

      <PreviewSheet
        isOpen={run.previewOpen}
        onClose={run.closePreview}
        onConfirm={run.confirmRun}
        onUndo={operations => run.undo(operations, false)}
        categories={categories}
        runState={run.runState}
        runMetrics={run.runMetrics}
        runProgress={run.runProgress}
        files={run.previewFiles}
        smartRenameEnabled={smartRenameEnabled}
        organizationMode={organizationMode}
        conflictResolution={conflictResolution}
      />

      <NaturalLanguageRuleBuilder
        isOpen={ruleBuilderOpen}
        onClose={() => setRuleBuilderOpen(false)}
        onSave={rule => proposeAiRule(rule, "builder")}
      />
      {fileSearchFolder && <OrganizedFileSearch folder={fileSearchFolder} onClose={() => setFileSearchFolder(null)} />}

      <AiRuleReviewDialog
        key={aiReview ? `${aiReview.instruction}-${aiReview.kind}-${aiReview.turns.length}` : "closed"}
        review={aiReview}
        busy={aiBusy}
        error={aiReviewError}
        onCancel={() => { setAiReview(null); setAiReviewError(null); }}
        onClarify={answer => void clarifyAiRule(answer)}
        onConfirm={confirmAiRule}
      />

      <InsightsSidebar
        isOpen={insightsOpen}
        onClose={() => setInsightsOpen(false)}
        insights={insights}
      />

      <AuditLogSidebar
        isOpen={auditLogOpen}
        onClose={() => setAuditLogOpen(false)}
        operations={operations}
        lastRunTime={run.runMetrics.timestamp}
        onUndo={run.undo}
        isUndoing={run.isUndoing}
      />

      <NoticeDialog
        open={notice !== null}
        onOpenChange={(open) => {
          if (!open) setNotice(null);
        }}
        message={notice ?? ""}
      />

      <Toaster position="top-center" richColors />
    </div>
  );
}

function Divider() {
  return <div className="h-px w-full bg-black/[0.04] dark:bg-white/[0.04]" aria-hidden="true" />;
}

/** A thin progress bar under the top bar while a scan or run is in flight. */
function RunProgressBar({ runState, progress }: { runState: RunState; progress: number }) {
  const active = runState === "scanning" || runState === "running";

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="progress-bar"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute top-[52px] left-0 right-0 h-[2px] bg-black/5 dark:bg-white/5 z-20 overflow-hidden"
          role="progressbar"
          aria-label={runState === "scanning" ? "Scanning files…" : "Organizing files…"}
          aria-valuenow={runState === "scanning" ? undefined : progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {runState === "scanning" ? (
            // There is no file count during the scan, so the bar is indeterminate.
            <motion.div
              className="h-full w-1/3 bg-[var(--system-blue)] rounded-full"
              animate={{ x: ["-100%", "400%"] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : (
            <motion.div
              className="h-full bg-[var(--system-blue)]"
              style={{ width: `${progress}%` }}
              transition={{ duration: 0.25 }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface LiveRegionProps {
  runState: RunState;
  runProgress: number;
  metrics: { moved: number; renamed: number; duplicates: number; errors: number };
  aiBusy: boolean;
  aiFeedback: AiFeedback | null;
}

/** Announces run and AI status to VoiceOver, which cannot see the progress bar. */
function LiveRegion({ runState, runProgress, metrics, aiBusy, aiFeedback }: LiveRegionProps) {
  let message = "";

  if (runState === "scanning") {
    message = "Scanning files to organize…";
  } else if (runState === "running") {
    message = `Organizing files… ${Math.round(runProgress)}% complete`;
  } else if (runState === "completed") {
    message = `Organization complete. Moved ${metrics.moved}, renamed ${metrics.renamed}, and found ${metrics.duplicates} duplicates.`;
  } else if (runState === "error") {
    message = `Organization finished with errors. ${metrics.errors} errors encountered.`;
  } else if (aiBusy) {
    message = "AI is processing your request…";
  } else if (aiFeedback) {
    message = `AI ${aiFeedback.type}: ${aiFeedback.message}`;
  }

  return (
    <div aria-live="assertive" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
