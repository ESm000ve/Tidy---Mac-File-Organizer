import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { FilterCard } from "../FilterCard";
import { ToggleControl } from "../controls/ToggleControl";
import { Folder } from "../icons";
import {
  AVAILABLE_EXTENSIONS,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  GLASS_SURFACE,
  SMART_SUBFOLDERS,
  type BuiltInCategoryId,
} from "../../constants";
import type { Category } from "../../types";

/** How many extensions the subfolder preview lists before collapsing to "+N more". */
const SUBFOLDER_PREVIEW_LIMIT = 4;

interface CategoryRuleCardProps {
  category: Category;
  expanded: boolean;
  /** False when a search is active and this category is not a match. */
  matchesSearch: boolean;
  /** True while a search is active at all, which enables match highlighting. */
  searching: boolean;
  /** The current search text, used to dim non-matching extension chips. */
  searchQuery: string;
  onToggleExpanded: () => void;
  onPatch: (patch: Partial<Category>) => void;
  onToggleExtension: (extension: string) => void;
}

/** One rule in the Automated Rules grid, with its expandable settings drawer. */
export function CategoryRuleCard({
  category,
  expanded,
  matchesSearch,
  searching,
  searchQuery,
  onToggleExpanded,
  onPatch,
  onToggleExtension,
}: CategoryRuleCardProps) {
  const offeredExtensions =
    AVAILABLE_EXTENSIONS[category.id as BuiltInCategoryId] ?? category.extensions;
  const smartSubfolders = SMART_SUBFOLDERS[category.id] ?? [];
  const hiddenExtensionCount = category.extensions.length - SUBFOLDER_PREVIEW_LIMIT;

  return (
    <div
      className={clsx(
        GLASS_SURFACE,
        "group transition-all duration-200 relative overflow-hidden",
        !matchesSearch && "opacity-30 pointer-events-none",
        searching && matchesSearch && "ring-1 ring-[var(--system-blue)]/25",
      )}
    >
      <FilterCard
        label={category.name}
        count={`${category.extensions.length} types`}
        icon={CATEGORY_ICONS[category.id] ?? Folder}
        color={CATEGORY_COLORS[category.id]}
        enabled={category.enabled}
        expanded={expanded}
        onExpandToggle={onToggleExpanded}
        onToggle={(enabled) => onPatch({ enabled })}
      />

      <AnimatePresence>
        {expanded && (
          <motion.div
            key={`expanded-${category.id}`}
            id={`toggle-${category.name.replace(/\s+/g, "-").toLowerCase()}-content`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
            // The card header toggles expansion on click; keep clicks inside
            // the drawer from bubbling up and collapsing it again.
            onClick={(event) => {
              event.stopPropagation();
              event.nativeEvent.stopImmediatePropagation();
            }}
          >
            <div className="mx-4 h-px bg-black/5 dark:bg-white/10" />

            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[14px] text-muted-foreground">Create subfolders</label>
                <ToggleControl
                  checked={category.subfolders}
                  onCheckedChange={(subfolders) => onPatch({ subfolders })}
                  disabled={!category.enabled}
                  color="blue"
                  size="sm"
                  aria-label={`Create subfolders for ${category.name}`}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[14px] text-muted-foreground">Smart categorization</label>
                  <p
                    className="text-[12px] text-[var(--tidy-secondary-label)]"
                    title="Group files by detected content type (e.g., Screenshots, Photos, Scans). Preview before applying."
                  >
                    Advanced categorization with AI
                  </p>
                </div>
                <ToggleControl
                  checked={Boolean(category.smartCategorization)}
                  onCheckedChange={(smartCategorization) => onPatch({ smartCategorization })}
                  disabled={!category.enabled}
                  color="purple"
                  size="sm"
                  aria-label={`Smart categorization for ${category.name}`}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[14px] text-muted-foreground">Duplicate detection</label>
                  <p
                    className="text-[12px] text-[var(--tidy-secondary-label)]"
                    title="Identify and handle duplicate files. Preview before applying."
                  >
                    Detect duplicates
                  </p>
                </div>
                <ToggleControl
                  checked={Boolean(category.duplicateDetection)}
                  onCheckedChange={(duplicateDetection) => onPatch({ duplicateDetection })}
                  disabled={!category.enabled}
                  color="blue"
                  size="sm"
                  aria-label={`Duplicate detection for ${category.name}`}
                />
              </div>

              {category.subfolders && category.enabled && (
                <div>
                  <label className="text-[14px] text-muted-foreground block mb-2">
                    {category.smartCategorization ? "Content types" : "By extension"}
                  </label>
                  <div className="p-2.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/[0.06]">
                    <div className="flex items-start gap-1.5">
                      <Folder className="w-3 h-3 text-[var(--tidy-secondary-label)] shrink-0 mt-0.5" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] text-[var(--tidy-secondary-label)] mb-1">{category.name}</p>
                        <div className="pl-3 space-y-0.5">
                          {category.smartCategorization
                            ? smartSubfolders.map((subfolder) => (
                                <SubfolderRow key={subfolder} label={subfolder} />
                              ))
                            : category.extensions
                                .slice(0, SUBFOLDER_PREVIEW_LIMIT)
                                .map((extension) => (
                                  <SubfolderRow key={extension} label={`.${extension}`} mono />
                                ))}

                          {!category.smartCategorization && hiddenExtensionCount > 0 && (
                            <SubfolderRow label={`+${hiddenExtensionCount} more`} mono muted />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[14px] text-muted-foreground block mb-2">Extensions</label>
                <div className="flex flex-wrap gap-1.5">
                  {offeredExtensions.map((extension) => {
                    const selected = category.extensions.includes(extension);
                    const matchesQuery =
                      !searching || extension.toLowerCase().includes(searchQuery.toLowerCase());

                    return (
                      <button
                        key={extension}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleExtension(extension);
                        }}
                        disabled={!category.enabled}
                        aria-pressed={selected}
                        className="tidy-extension"
                      >
                        .{extension}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {category.enabled && matchesSearch && (
        <div
          className="absolute inset-0 bg-gradient-to-br from-black/[0.03] to-transparent dark:from-white/[0.03] dark:to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function SubfolderRow({
  label,
  mono,
  muted,
}: {
  label: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1 h-1 rounded-full bg-foreground/20 shrink-0" aria-hidden="true" />
      <span
        className={clsx(
          mono && "font-mono",
          muted
            ? "text-[12px] text-[var(--tidy-secondary-label)] dark:text-[var(--tidy-secondary-label)]"
            : "text-[12px] text-[var(--tidy-secondary-label)]",
        )}
      >
        {label}
      </span>
    </div>
  );
}
