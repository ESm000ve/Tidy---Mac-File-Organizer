import { useCallback, useEffect, useMemo, useState } from "react";
import type { Category } from "../types";
import { createInitialCategories } from "../constants";

const CATEGORY_STORAGE_KEY = "tidy_categories";

function loadCategories(): Category[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(CATEGORY_STORAGE_KEY) ?? "null");
    if (Array.isArray(saved) && saved.every(category =>
      typeof category?.id === "string" && typeof category.name === "string" &&
      typeof category.enabled === "boolean" && typeof category.subfolders === "boolean" &&
      Array.isArray(category.extensions) && category.extensions.every((extension: unknown) => typeof extension === "string"))) {
      return saved;
    }
  } catch { /* Start with the built-in rules if storage is unavailable. */ }
  return createInitialCategories();
}

/**
 * The category rule list and every operation the UI performs on it.
 *
 * `App` previously carried six near-identical `setCategories(p => p.map(...))`
 * handlers inline; they are collapsed here into one `updateCategory` primitive
 * with named wrappers on top.
 */
export function useCategoryRules() {
  const [categories, setCategories] = useState<Category[]>(loadCategories);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try { window.localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(categories)); }
    catch { /* Keep the edited rules in memory if storage is unavailable. */ }
  }, [categories]);

  /** Apply a patch to one category by id, leaving the rest untouched. */
  const updateCategory = useCallback((id: string, patch: Partial<Category>) => {
    setCategories((previous) =>
      previous.map((category) => (category.id === id ? { ...category, ...patch } : category)),
    );
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Add or remove a single extension from a category's selection. */
  const toggleExtension = useCallback((id: string, extension: string) => {
    setCategories((previous) =>
      previous.map((category) => {
        if (category.id !== id) return category;
        const selected = category.extensions.includes(extension);
        return {
          ...category,
          extensions: selected
            ? category.extensions.filter((value) => value !== extension)
            : [...category.extensions, extension],
        };
      }),
    );
  }, []);

  /**
   * Flip an AI feature across every category at once, from the chip row.
   * If any category has it on, the chip turns them all off, and vice versa.
   */
  const toggleFeatureForAll = useCallback(
    (feature: "smartCategorization" | "duplicateDetection") => {
      setCategories((previous) => {
        const anyEnabled = previous.some((category) => category[feature]);
        return previous.map((category) => ({ ...category, [feature]: !anyEnabled }));
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setCategories(createInitialCategories());
    setExpandedIds(new Set());
  }, []);

  const enabledCount = useMemo(
    () => categories.filter((category) => category.enabled).length,
    [categories],
  );

  return {
    categories,
    setCategories,
    expandedIds,
    enabledCount,
    updateCategory,
    toggleExpanded,
    toggleExtension,
    toggleFeatureForAll,
    reset,
  };
}
