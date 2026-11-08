import { clsx } from "clsx";
import { format } from "date-fns";



import { TimePicker } from "./TimePicker";
import { ToggleControl } from "./controls/ToggleControl";
import type { ConflictResolution, MetadataGrouping, OrganizationMode } from "../types";

interface BottomPanelProps {
  scheduleType: "manual" | "daily" | "weekly" | "monthly";
  onScheduleTypeChange: (type: "manual" | "daily" | "weekly" | "monthly") => void;
  scheduleTime: string;
  onScheduleTimeChange: (time: string) => void;
  scheduleDate: Date | null;
  onScheduleDateChange: (date: Date | undefined) => void;
  conflictResolution: ConflictResolution;
  onConflictResolutionChange: (res: ConflictResolution) => void;
  watchEnabled: boolean;
  onWatchEnabledChange: (enabled: boolean) => void;
  organizationMode: OrganizationMode;
  onOrganizationModeChange: (mode: OrganizationMode) => void;
  metadataGrouping: MetadataGrouping;
  onMetadataGroupingChange: (grouping: MetadataGrouping) => void;
}

// ─── Design tokens — match App-wide spec ──────────────────────────────────────
const CARD_CLS = "tidy-surface";

/** Dropdown selector */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

function SelectControl({
  value,
  onValueChange,
  options,
  label,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  label?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className="w-full bg-black/5 dark:bg-white/[0.05] border border-black/10 dark:border-white/10 text-[14px] h-9 px-3 hover:bg-black/10 dark:hover:bg-white/[0.08] transition-colors"
        aria-label={label}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-white/80 dark:bg-black/80 backdrop-blur-xl border-black/10 dark:border-white/15">
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-[14px] focus:bg-blue-500/10 focus:text-foreground">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const SEGMENTS = ["manual", "daily", "weekly", "monthly"] as const;

export function BottomPanel({
  scheduleType, onScheduleTypeChange,
  scheduleTime, onScheduleTimeChange,
  scheduleDate, onScheduleDateChange,
  conflictResolution, onConflictResolutionChange,
  watchEnabled, onWatchEnabledChange,
  organizationMode, onOrganizationModeChange,
  metadataGrouping, onMetadataGroupingChange,
}: BottomPanelProps) {
  return (
    <section className="space-y-3" aria-label="Schedule and Conflict Resolution">
      <h2 className="text-[20px] font-semibold text-foreground pl-0.5">Schedule and conflicts</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Schedule Card — no blur, no shadow ── */}
        <div className={`rounded-lg p-5 ${CARD_CLS}`}>
          <label className="text-[14px] text-muted-foreground block mb-3" id="frequency-label">Frequency</label>

          <div className="flex flex-col gap-4">

            {/* Segmented Control — recessed pill track */}
            <div
              role="radiogroup"
              aria-labelledby="frequency-label"
              className="tidy-frequency flex items-center gap-2 w-fit select-none"
            >
              {SEGMENTS.map((type) => (
                <button
                  key={type}
                  role="radio"
                  tabIndex={scheduleType === type ? 0 : -1}
                  onKeyDown={event => {
                      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                      const index = event.key === "Home" ? 0 : event.key === "End" ? SEGMENTS.length - 1 : (SEGMENTS.indexOf(type) + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + SEGMENTS.length) % SEGMENTS.length;
                    onScheduleTypeChange(SEGMENTS[index]);
                    (event.currentTarget.parentElement?.children[index] as HTMLElement)?.focus();
                  }}
                  onClick={() => onScheduleTypeChange(type)}
                  aria-checked={scheduleType === type}
                  className={clsx(
                    "px-3.5 py-[5px] text-[14px] rounded-[4px] transition-all capitalize",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)]",
                    scheduleType === type ? "text-foreground dark:text-white bg-white shadow-sm dark:bg-white/[0.12] dark:shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.14)]" : "text-muted-foreground hover:text-foreground dark:hover:text-[var(--tidy-secondary-label)]"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Time + Date */}
            {scheduleType !== "manual" && (
              <div className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <TimePicker value={scheduleTime} onChange={onScheduleTimeChange} />

                <input type="date" className="tidy-time" aria-label="Schedule start date"
                  value={scheduleDate ? format(scheduleDate, "yyyy-MM-dd") : ""}
                  onChange={event => onScheduleDateChange(event.target.value ? new Date(event.target.value + "T00:00:00") : undefined)} />
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="watch-source" className="text-[14px]">Watch for new files</label>
              <ToggleControl id="watch-source" checked={watchEnabled} onCheckedChange={onWatchEnabledChange} aria-describedby="watch-source-help" />
            </div>
            <p id="watch-source-help" className="text-[12px] text-muted-foreground">
              Tidy organizes new arrivals after they stop changing. Watching continues while Tidy is running in the menu bar.
            </p>
          </div>
        </div>

        {/* ── Conflict Resolution Card — no blur, no shadow ── */}
        <div className={`rounded-lg p-5 ${CARD_CLS}`}>
          <label className="text-[14px] text-muted-foreground block mb-3" id="conflict-label">Conflicts and duplicates</label>
          <div className="space-y-3">
            <SelectControl
              value={conflictResolution}
              onValueChange={v => onConflictResolutionChange(v as ConflictResolution)}
              label="Conflict resolution strategy"
              options={[
                { value: "rename", label: "Keep both (append a number)" },
                { value: "archive", label: "Archive duplicates" },
                { value: "trash", label: "Move duplicates to Trash" },
                { value: "skip", label: "Skip the file" },
                { value: "overwrite", label: "Replace existing (keep backup)" },
              ]}
            />
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              {conflictResolution === "trash"
                ? "Enable duplicate detection on the rules you want to check. Use Put Back in Finder’s Trash to recover duplicates."
                : conflictResolution === "overwrite"
                  ? "Replaced files are kept in .Tidy Undo inside the destination."
                  : "Archive puts duplicates in Duplicates_Archive. Enable duplicate detection on the rules you want to check."}
            </p>
          </div>
        </div>

      </div>
      <div className={`${CARD_CLS} p-5 grid grid-cols-1 md:grid-cols-2 gap-4`}>
        <div className="space-y-2">
          <p className="text-[14px] text-muted-foreground">Organize by</p>
          <SelectControl
            label="Organization method"
            value={organizationMode}
            onValueChange={value => onOrganizationModeChange(value as OrganizationMode)}
            options={[{ value: "move", label: "Move into folders" }, { value: "tags", label: "Apply Finder tags in place" }]}
          />
        </div>
        {organizationMode === "move" && (
          <div className="space-y-2">
            <p className="text-[14px] text-muted-foreground">Group inside each category</p>
            <SelectControl
              label="Group by metadata"
              value={metadataGrouping}
              onValueChange={value => onMetadataGroupingChange(value as MetadataGrouping)}
              options={[
                { value: "none", label: "Use category rules" },
                { value: "website", label: "Download website" },
                { value: "photo-date", label: "Photo capture year and month" },
                { value: "content-year", label: "Smart Sort folders by year" },
              ]}
            />
            {metadataGrouping === "content-year" && <p className="text-[12px] text-muted-foreground">Accepted Smart Sort folders can use a document date, photo capture date, or the modified year.</p>}
          </div>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground">The installed macOS app can run schedules after Tidy quits. Weekly runs occur on Monday and monthly runs on the first day.</p>
    </section>
  );
}
