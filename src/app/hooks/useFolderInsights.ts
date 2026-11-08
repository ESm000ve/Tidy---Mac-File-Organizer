import { useEffect, useState } from "react";
import type { InsightData } from "../types";

/**
 * Scan the source folder for the heuristics behind the Insights sidebar.
 *
 * Re-runs whenever the folder changes and ignores results that arrive after a
 * newer scan has started, so switching folders quickly can't leave stale counts
 * on screen. Returns `null` when there is no folder or no desktop bridge.
 */
export function useFolderInsights(sourcePath: string, includeSubfolders = false, destPath = "", selectedSourceFolders?: string[] | null, selectedFileExtensions?: string[] | null): InsightData | null {
  const [data, setData] = useState<InsightData | null>(null);

  useEffect(() => {
    if (!sourcePath || !window.electron?.getFolderInsights) {
      setData(null);
      return;
    }

    let current = true;
    window.electron
      .getFolderInsights(sourcePath, { includeSubfolders, destPath, selectedSourceFolders, selectedFileExtensions })
      .then((result) => {
        if (current) setData(result);
      })
      .catch(() => {
        if (current) setData(null);
      });

    return () => {
      current = false;
    };
  }, [sourcePath, includeSubfolders, destPath, selectedSourceFolders, selectedFileExtensions]);

  return data;
}
