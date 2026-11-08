/**
 * Folder pickers, file reveal in Finder, and opening folders.
 */
import { lstat, realpath } from "node:fs/promises";
import { dialog, ipcMain, shell, type WebContents } from "electron";
import { CHANNELS } from "../channels";
import { getMainWindow } from "../window";

const previewPaths = new WeakMap<WebContents, Set<string>>();

export function authorizeQuickLook(sender: WebContents, paths: string[]): void {
  previewPaths.set(sender, new Set(paths));
}

export function registerDialogHandlers(): void {
  ipcMain.handle(CHANNELS.openDirectory, async () => {
    const window = getMainWindow();
    if (!window) return null;

    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      properties: ["openDirectory", "createDirectory"],
    });
    return canceled ? null : (filePaths[0] ?? null);
  });

  /** Reveal a file in Finder. */
  ipcMain.handle(CHANNELS.previewFile, async (_event, filePath: string) => {
    // Reveal rather than execute: a preview must never launch an executable.
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle(CHANNELS.quickLook, async (event, filePath: string) => {
    const window = getMainWindow();
    if (!window || window.webContents !== event.sender || !previewPaths.get(event.sender)?.has(filePath)) return false;
    try {
      if (!(await lstat(filePath)).isFile() || await realpath(filePath) !== filePath || window.isDestroyed()) return false;
      if (process.platform === "darwin") window.previewFile(filePath);
      else shell.showItemInFolder(filePath);
      return true;
    } catch { return false; }
  });

  /** Open a folder in Finder. */
  ipcMain.handle(CHANNELS.openFolder, async (_event, folderPath: string) => {
    // `openPath` resolves with an error *string*, not a rejection.
    const error = await shell.openPath(folderPath);
    if (error) {
      console.error(`Could not open ${folderPath}:`, error);
      return { success: false, error };
    }
    return { success: true };
  });
}
