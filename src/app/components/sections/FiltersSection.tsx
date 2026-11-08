import { SelectControl, type SelectOption } from "../controls/SelectControl";
import { ToggleControl } from "../controls/ToggleControl";
import { GLASS_SURFACE } from "../../constants";
import type { DateFilter, Filters, SizeFilter } from "../../types";
import { DATE_FILTER_LABELS, DEFAULT_OLDER_DAYS, isOlderDays, MAX_OLDER_DAYS } from "../../../shared/dateFilters";

const DATE_OPTIONS: readonly SelectOption<DateFilter>[] = (Object.keys(DATE_FILTER_LABELS) as DateFilter[])
  .map(value => ({ value, label: DATE_FILTER_LABELS[value] }));

const SIZE_OPTIONS: readonly SelectOption<SizeFilter>[] = [
  { value: "any", label: "Any size" },
  { value: "small", label: "Small  (< 1 MB)" },
  { value: "medium", label: "Medium  (1 MB – 100 MB)" },
  { value: "large", label: "Large  (> 100 MB)" },
];

interface FiltersSectionProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

/** Which files a run considers, before category rules are applied. */
export function FiltersSection({ filters, onChange }: FiltersSectionProps) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <section aria-label="Filters" className="flex flex-col gap-3">
      <h2 className="text-[20px] font-semibold text-foreground">
        Smart filters
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${GLASS_SURFACE} p-4`}>
          <SelectControl
            label="Date modified"
            value={filters.dateModified}
            onChange={dateModified => onChange({
              ...filters,
              dateModified,
              olderThanDays: dateModified === "older" ? filters.olderThanDays ?? DEFAULT_OLDER_DAYS : filters.olderThanDays,
            })}
            options={DATE_OPTIONS}
          />
          {filters.dateModified === "older" && (
            <label className="mt-3 flex items-center gap-2 text-[13px]">
              Older than
              <input className="tidy-time min-w-0 w-20" type="number" min={1} max={MAX_OLDER_DAYS} step={1}
                aria-label="Older than days" value={filters.olderThanDays ?? DEFAULT_OLDER_DAYS}
                onChange={event => { if (isOlderDays(event.target.valueAsNumber)) set("olderThanDays", event.target.valueAsNumber); }} />
              days
            </label>
          )}
        </div>

        <div className={`${GLASS_SURFACE} p-4`}>
          <SelectControl
            label="File size"
            value={filters.fileSize}
            onChange={(value) => set("fileSize", value)}
            options={SIZE_OPTIONS}
          />
        </div>

        <div className={`${GLASS_SURFACE} p-4 flex items-center justify-between gap-4`}>
          <div className="min-w-0">
            <p className="text-[14px] text-foreground" id="exclude-hidden-label">
              Exclude hidden
            </p>
            <p className="text-[14px] text-muted-foreground mt-0.5" id="exclude-hidden-desc">
              Skip files whose names begin with a dot
            </p>
          </div>
          <ToggleControl
            checked={filters.excludeHidden}
            onCheckedChange={(value) => set("excludeHidden", value)}
            aria-labelledby="exclude-hidden-label"
            aria-describedby="exclude-hidden-desc"
          />
        </div>
      </div>
    </section>
  );
}
