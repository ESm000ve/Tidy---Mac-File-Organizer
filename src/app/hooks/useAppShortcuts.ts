import { useEffect, useRef } from "react";

interface ShortcutHandlers {
  /** Enter, when focus is not in a control that owns the key. */
  onRun: () => void;
  /** ⌘Z, when there is a completed run to reverse. */
  onUndo: () => void;
}

interface ShortcutOptions {
  /** True while any sheet, sidebar, or dialog is open. Suppresses all shortcuts. */
  isModalOpen: boolean;
  /** True when a run has operations that can be reversed. */
  canUndo: boolean;
}

/**
 * True when the event's target is somewhere the user is typing, in which case
 * the keystroke belongs to that control rather than to the app.
 */
function isTextEntry(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.isContentEditable
  );
}

/**
 * Window-level keyboard shortcuts.
 *
 * Handlers are read through a ref so the listener attaches once. Text-entry
 * targets are excluded first: ⌘Z inside a text field must stay the native text
 * undo, not "reverse my last file move".
 */
export function useAppShortcuts(
  handlers: ShortcutHandlers,
  { isModalOpen, canUndo }: ShortcutOptions,
): void {
  const latest = useRef(handlers);
  latest.current = handlers;

  const state = useRef({ isModalOpen, canUndo });
  state.current = { isModalOpen, canUndo };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const { isModalOpen: modalOpen, canUndo: undoAvailable } = state.current;
      const typing = isTextEntry(event.target);

      if ((event.metaKey || event.ctrlKey) && event.key === "z" && !event.shiftKey) {
        if (!typing && !modalOpen && undoAvailable) {
          event.preventDefault();
          latest.current.onUndo();
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        window.dispatchEvent(new Event("tidy:open-preferences"));
        return;
      }

      if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
        // Buttons handle Enter themselves; don't run Tidy from underneath one.
        const onButton = (event.target as HTMLElement | null)?.tagName === "BUTTON";
        if (!typing && !onButton && !modalOpen) {
          event.preventDefault();
          latest.current.onRun();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
