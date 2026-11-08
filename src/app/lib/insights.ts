/**
 * Turning raw folder-scan counts into the grouped insights the sidebar renders.
 *
 * The main process reports how many files matched each heuristic; this decides
 * which of those are worth surfacing, given the rules the user has enabled.
 */
import { Copy, Document, Folder, Music, PhotoFill } from "../components/icons";
import type { Category, InsightData, InsightGroup, InsightItem } from "../types";

interface BuildInsightsOptions {
  data: InsightData | null;
  categories: Category[];
  /** Invoked by every insight's action button — opens the preview sheet. */
  onReview: () => void;
}

function isEnabled(categories: Category[], id: string): boolean {
  return categories.find((category) => category.id === id)?.enabled ?? false;
}

/**
 * Build the sidebar's insight groups.
 *
 * Only non-zero counts appear, and a group is omitted entirely when the rule it
 * relates to is switched off — there is no point flagging audio metadata when
 * audio isn't being organized. When nothing specific matches but the folder has
 * files, a single summary group stands in so the sidebar is never blank.
 */
export function buildInsightGroups({
  data,
  categories,
  onReview,
}: BuildInsightsOptions): InsightGroup[] {
  if (!data) return [];

  const { counts } = data;
  const groups: InsightGroup[] = [];
  const item = (label: string, count: number): InsightItem => ({
    label,
    count,
    action: { label: "View", onClick: onReview },
  });

  const fileItems: InsightItem[] = [];
  if (counts.screenshots > 0) fileItems.push(item("Screenshots", counts.screenshots));
  if (counts.photos > 0) fileItems.push(item("Photos", counts.photos));
  if (counts.recordings > 0) fileItems.push(item("Screen recordings", counts.recordings));
  if (fileItems.length > 0) {
    groups.push({
      title: "File Types",
      icon: PhotoFill,
      accentColor: "var(--system-purple)",
      items: fileItems,
    });
  }

  const duplicateDetectionOn = categories.some(
    (category) => category.duplicateDetection && category.enabled,
  );
  if (duplicateDetectionOn && counts.duplicates > 0) {
    groups.push({
      title: "Duplicates",
      icon: Copy,
      accentColor: "var(--system-orange)",
      items: [
        {
          label: "Potential duplicates",
          count: counts.duplicates,
          action: { label: "Review", onClick: onReview },
        },
      ],
    });
  }

  const documentItems: InsightItem[] = [];
  if (counts.invoices > 0) documentItems.push(item("Likely invoices", counts.invoices));
  if (counts.contracts > 0) documentItems.push(item("Contracts detected", counts.contracts));
  if (isEnabled(categories, "documents") && documentItems.length > 0) {
    groups.push({
      title: "Documents",
      icon: Document,
      accentColor: "var(--system-blue)",
      items: documentItems,
    });
  }

  if (isEnabled(categories, "audio") && counts.audioMissingMeta > 0) {
    groups.push({
      title: "Audio",
      icon: Music,
      accentColor: "var(--system-orange)",
      items: [
        {
          label: "Missing artist metadata",
          count: counts.audioMissingMeta,
          action: { label: "Review", onClick: onReview },
        },
      ],
    });
  }

  if (groups.length === 0 && data.total > 0) {
    groups.push({
      title: "Folder Scan",
      icon: Folder,
      accentColor: "var(--system-green)",
      items: [item("Total files ready", data.total)],
    });
  }

  return groups;
}

