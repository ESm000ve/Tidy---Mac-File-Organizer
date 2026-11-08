import { useEffect } from "react";

/**
 * Close a modal surface with Escape (WCAG 2.1.1 Keyboard; ARIA dialog pattern).
 * Registered only while `active`, and ignored if a nested control already
 * handled the key.
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onEscape();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [active, onEscape]);
}
