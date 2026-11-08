import { CategoryRuleCard } from "./CategoryRuleCard";
import { Copy, Sparkles, type Icon } from "../icons";
import type { Category } from "../../types";
import { SelectControl } from "../controls/SelectControl";
import type { NamingStyle, RenameEngine } from "../../../shared/naming";

interface RulesSectionProps {
  categories: Category[];
  expandedIds: Set<string>;
  enabledCount: number;
  /** Ids matching the current search, or null when no search is active. */
  searchMatches: Set<string> | null;
  searchQuery: string;
  smartRenameEnabled: boolean;
  namingStyle: NamingStyle;
  onNamingStyleChange: (style: NamingStyle) => void;
  renameEngine: RenameEngine;
  onRenameEngineChange: (engine: RenameEngine) => void;
  onSmartRenameToggle: () => void;
  onToggleFeatureForAll: (feature: "smartCategorization" | "duplicateDetection") => void;
  onToggleExpanded: (id: string) => void;
  onPatchCategory: (id: string, patch: Partial<Category>) => void;
  onToggleExtension: (id: string, extension: string) => void;
  onSuggestFolderRules: () => void;
  canSuggestFolderRules: boolean;
}

/** The AI feature chips and the two-column grid of category rules. */
export function RulesSection({
  categories,
  expandedIds,
  enabledCount,
  searchMatches,
  searchQuery,
  smartRenameEnabled,
  namingStyle,
  onNamingStyleChange,
  renameEngine,
  onRenameEngineChange,
  onSmartRenameToggle,
  onToggleFeatureForAll,
  onToggleExpanded,
  onPatchCategory,
  onToggleExtension,
  onSuggestFolderRules,
  canSuggestFolderRules,
}: RulesSectionProps) {
  const smartSortOn = categories.some((category) => category.smartCategorization);
  const duplicatesOn = categories.some((category) => category.duplicateDetection);

  // Alternate categories between two columns so cards of differing heights
  // stay balanced as rules expand and collapse.
  const columns = [
    categories.filter((_, index) => index % 2 === 0),
    categories.filter((_, index) => index % 2 === 1),
  ];

  return (
    <section aria-label="File Rules" className="flex flex-col gap-3">
      <div className="flex items-center justify-between pl-1">
        <h2 className="text-[20px] font-semibold text-foreground">
          Automated rules
        </h2>
        <span className="text-[14px] text-muted-foreground">
          {searchMatches ? `${searchMatches.size} matching` : `${enabledCount} active`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" className="tidy-button" disabled={!canSuggestFolderRules} onClick={onSuggestFolderRules}>
          Suggest rules for this folder
        </button>
        <p className="text-[12px] text-muted-foreground">Shares a sample of filenames with Gemini for your review.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Organization tools">
        <span className="text-[12px] font-semibold text-[var(--system-purple)] flex items-center gap-1 mr-1">
          <Sparkles className="w-3 h-3" aria-hidden="true" />
          Tools
        </span>

        <FeatureChip
          id="ai-smart-rename-chip"
          icon={Sparkles}
          label="Smart rename"
          active={smartRenameEnabled}
          onClick={onSmartRenameToggle}
          title="Use AI to generate better file names based on content and metadata"
        />
        <FeatureChip
          id="ai-smart-cat-chip"
          icon={Sparkles}
          label="Smart sort"
          active={smartSortOn}
          onClick={() => onToggleFeatureForAll("smartCategorization")}
          title="Use AI to sort files into smart content-based subfolders (e.g. Screenshots, Invoices)"
        />
        <FeatureChip
          id="ai-dup-detect-chip"
          icon={Copy}
          label="Find duplicates"
          active={duplicatesOn}
          onClick={() => onToggleFeatureForAll("duplicateDetection")}
          title="Compare complete file contents locally; no AI or upload is needed"
        />
      </div>

      {smartRenameEnabled && <div className="tidy-naming-choice"><SelectControl label="Naming style" value={namingStyle} onChange={onNamingStyleChange} options={[{ value: "descriptive", label: "Descriptive" }, { value: "date-first", label: "Date first" }]} /><p>{namingStyle === "date-first" ? "Prefix suggestions with the file's last modified date: YYYY-MM-DD_Name.ext." : "Use short, meaningful file names. Suggestions are reviewed before a run."}</p></div>}
      {(smartRenameEnabled || smartSortOn) && <div className="tidy-naming-choice">
        <SelectControl label="Analyze files with" value={renameEngine} onChange={onRenameEngineChange}
          options={[{ value: "gemini", label: "Gemini" }, { value: "on-device", label: "On-device text recognition" }]} />
        <p>{renameEngine === "on-device" ? "Recognizes text in supported images and first pages of PDFs on this Mac." : "Gemini can use supported file contents to suggest names and folders."}</p>
      </div>}

      <div className="flex flex-col md:flex-row gap-4 items-start">
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className="w-full md:flex-1 flex flex-col gap-4">
            {column.map((category) => (
              <CategoryRuleCard
                key={category.id}
                category={category}
                expanded={expandedIds.has(category.id)}
                matchesSearch={!searchMatches || searchMatches.has(category.id)}
                searching={searchMatches !== null}
                searchQuery={searchQuery}
                onToggleExpanded={() => onToggleExpanded(category.id)}
                onPatch={(patch) => onPatchCategory(category.id, patch)}
                onToggleExtension={(extension) => onToggleExtension(category.id, extension)}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

interface FeatureChipProps {
  id: string;
  icon: Icon;
  label: string;
  active: boolean;
  onClick: () => void;
  title: string;
}

/** Turns an optional tool on or off across the rule set. */
function FeatureChip({ id, icon: ChipIcon, label, active, onClick, title }: FeatureChipProps) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className="tidy-chip"
    >
      <ChipIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
      {label}

    </button>
  );
}
