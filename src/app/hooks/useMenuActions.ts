import { useEffect, useRef } from "react";

/** Actions the native menu bar and Dock menu can dispatch into the renderer. */
export type MenuAction =
  | "open-preferences"
  | "run-tidy"
  | "reset-rules"
  | "open-source"
  | "open-destination"
  | "toggle-insights"
  | "toggle-audit"
  | "clear-search"
  | "undo-organize";

export type MenuActionHandlers = Partial<Record<MenuAction, () => void>>;

/**
 * Subscribe to native menu actions.
 *
 * The subscription is registered once and reads handlers through a ref, so
 * passing inline callbacks does not tear down and re-attach the IPC listener on
 * every render — a leak the previous inline effect was prone to.
 */
export function useMenuActions(handlers: MenuActionHandlers): void {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!window.electron?.onMenuAction) return;
    return window.electron.onMenuAction((action) => {
      latest.current[action as MenuAction]?.();
    });
  }, []);
}
