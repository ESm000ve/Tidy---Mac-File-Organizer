/**
 * System appearance queries.
 */
import { ipcMain, nativeTheme } from "electron";
import { CHANNELS } from "../channels";

export function registerSystemHandlers(): void {
  ipcMain.handle(CHANNELS.setTheme, (_event, theme: unknown) => {
    if (theme === "light" || theme === "dark" || theme === "system") nativeTheme.themeSource = theme;
  });
}
