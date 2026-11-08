import { SourceChoices } from "./SourceChoices";
import { AnimatePresence, motion } from "motion/react";
import { ToggleControl } from "../controls/ToggleControl";
import { FolderCard } from "../FolderCard";
import { ArrowRight, Folder, FolderFill } from "../icons";

interface LocationsSectionProps {
  selectedSourceFolders: string[] | null;
  selectedFileExtensions: string[] | null;
  fileExtensions: string[];
  excludeHidden: boolean;
  onSelectionChange: (folders: string[] | null, types: string[] | null) => void;
  sourcePath: string;
  includeSubfolders: boolean;
  onIncludeSubfoldersChange: (include: boolean) => void;
  destPath: string;
  tagOnly?: boolean;
  onSourceChange: (path: string) => void;
  onDestChange: (path: string) => void;
  /** Opens the native folder picker; resolves to the chosen path, or null. */
  onBrowse: () => Promise<string | null>;
}

/** Source and destination pickers, plus a summary pill once both are set. */
export function LocationsSection({
  selectedSourceFolders, selectedFileExtensions, fileExtensions, excludeHidden, onSelectionChange,
  sourcePath,
  includeSubfolders,
  onIncludeSubfoldersChange,
  destPath,
  tagOnly = false,
  onSourceChange,
  onDestChange,
  onBrowse,
}: LocationsSectionProps) {
  const browseInto = (apply: (path: string) => void) => async () => {
    const chosen = await onBrowse();
    if (chosen) apply(chosen);
  };

  return (
    <section aria-label="Locations" className="flex flex-col gap-3">
      <div className="flex items-center justify-between pl-1">
        <h2 className="text-[20px] font-semibold text-foreground">
          Locations
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FolderCard
          label="Source"
          path={sourcePath}
          onPathChange={onSourceChange}
          onSelect={browseInto(onSourceChange)}
          accentColor="blue"
        />
        {tagOnly ? (
          <div className="tidy-surface flex flex-col justify-center gap-1 px-5 py-4">
            <p className="text-[14px] font-medium">Finder tags</p>
            <p className="text-[12px] text-muted-foreground">Files stay in the source folder when Tidy adds tags.</p>
          </div>
        ) : <FolderCard
          label="Destination"
          path={destPath}
          onPathChange={onDestChange}
          onSelect={browseInto(onDestChange)}
          accentColor="emerald"
        />}
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
        <div>
          <label htmlFor="include-subfolders" id="include-subfolders-label" className="text-[14px] font-medium">Include subfolders</label>
          <p id="include-subfolders-description" className="text-[12px] text-muted-foreground mt-1">Choose which folders to search below. Leave the original folders in place.</p>
        </div>
        <ToggleControl id="include-subfolders" checked={includeSubfolders} onCheckedChange={onIncludeSubfoldersChange} aria-labelledby="include-subfolders-label" aria-describedby="include-subfolders-description" />
      </div>

      {sourcePath && includeSubfolders && <SourceChoices sourcePath={sourcePath} destPath={tagOnly ? "" : destPath} includeSubfolders={includeSubfolders} excludeHidden={excludeHidden} fileExtensions={fileExtensions} selectedSourceFolders={selectedSourceFolders} selectedFileExtensions={selectedFileExtensions} onSelectionChange={onSelectionChange} />}

      <AnimatePresence>
        {!tagOnly && sourcePath && destPath && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-black/5 dark:bg-white/[0.05] border border-black/10 dark:border-white/10"
              role="status"
              aria-live="polite"
              aria-label={`Source: ${sourcePath}, Destination: ${destPath}`}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <div
                  className="w-5 h-5 rounded-md bg-[var(--system-blue)]/15 flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <FolderFill className="w-3 h-3 text-[var(--system-blue)]" />
                </div>
                <span className="text-[14px] text-[var(--tidy-secondary-label)] dark:text-foreground truncate">
                  {sourcePath}
                </span>
              </div>

              <ArrowRight className="w-3.5 h-3.5 text-[var(--tidy-secondary-label)] shrink-0" aria-hidden="true" />

              <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
                <span className="text-[14px] text-[var(--tidy-secondary-label)] dark:text-foreground truncate text-right">
                  {destPath}
                </span>
                <div
                  className="w-5 h-5 rounded-md bg-[var(--system-green)]/15 flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <Folder className="w-3 h-3 text-[var(--system-green)]" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
