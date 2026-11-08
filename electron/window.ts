/**
 * The application window and the paths the renderer is loaded from.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, nativeTheme } from "electron";
import { CHANNELS } from "./channels";

/** Set by Vite in development; absent in a packaged build. */
export const VITE_DEV_SERVER_URL = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL;

/** Window background colours, matched to the renderer's theme tokens so there
 *  is no light/dark flash between the window appearing and React painting. */
const BACKGROUND = { dark: "#202024", light: "#f5f5f7" } as const;

const WINDOW_SIZE = { width: 1024, height: 768, minWidth: 800, minHeight: 600 } as const;

/** Directory of the bundled main process, used to locate the preload script. */
const MAIN_DIR = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

function backgroundForAppearance(): string {
  return nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light;
}

/** The main window, or `null` if it has been closed. */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/** Send a one-way event to the renderer, if a window is open. */
export function sendToRenderer(channel: string, ...args: unknown[]): void {
  mainWindow?.webContents.send(channel, ...args);
}

/** Create the application window and load the renderer into it. */
export function createWindow(rendererDist: string): BrowserWindow {
  mainWindow = new BrowserWindow({
    ...WINDOW_SIZE,
    title: "Tidy",
    titleBarStyle: "hiddenInset",
    icon: path.join(MAIN_DIR, VITE_DEV_SERVER_URL ? "../assets/icon.png" : "../build/icon.png"),
    acceptFirstMouse: true,
    backgroundColor: backgroundForAppearance(),
    webPreferences: {
      preload: path.join(MAIN_DIR, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // App content never needs to navigate to an external page or open popups.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", event => event.preventDefault());

  const updateAppearance = () => mainWindow?.setBackgroundColor(backgroundForAppearance());
  nativeTheme.on("updated", updateAppearance);

  const window = mainWindow;
  const loading = VITE_DEV_SERVER_URL
    ? window.loadURL(VITE_DEV_SERVER_URL)
    : window.loadFile(path.join(rendererDist, "index.html"));
  void loading.catch(() => {
    if (window.isDestroyed()) return;
    dialog.showErrorBox("Tidy could not open", "The app interface could not load. Reinstall Tidy and open it again.");
    window.close();
  });

  // The renderer insets its top bar for full screen changes
  // when the window enters full screen.
  mainWindow.on("enter-full-screen", () => sendToRenderer(CHANNELS.fullScreenChange, true));
  mainWindow.on("leave-full-screen", () => sendToRenderer(CHANNELS.fullScreenChange, false));
  mainWindow.on("closed", () => {
    nativeTheme.removeListener("updated", updateAppearance);
    mainWindow = null;
  });

  return mainWindow;
}
