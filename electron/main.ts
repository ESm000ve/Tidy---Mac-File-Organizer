/**
 * Main process entry point.
 *
 * This file does bootstrap only — environment, lifecycle, and wiring. The work
 * lives in `./services` (what the app does), `./ipc` (what the renderer may
 * ask for), `./menu`, and `./window`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import * as dotenv from "dotenv";
import { registerIpcHandlers } from "./ipc";
import { SCHEDULED_RUN_FLAG } from "./ipc/schedule";
import { setupMenu, setupMenuBar } from "./menu";
import { loadRenameCache } from "./services/renameCache";
import { VITE_DEV_SERVER_URL, createWindow, getMainWindow } from "./window";

// Loads GEMINI_API_KEY from .env in development. In a packaged build the key
// comes from the real environment; a missing key is handled, not fatal.
if (!app.isPackaged) dotenv.config({ quiet: true });

const MAIN_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Project root at runtime: one level above the bundled main process. */
const APP_ROOT = path.join(MAIN_DIR, "..");

/** Built renderer assets, loaded directly from disk in a packaged build. */
const RENDERER_DIST = path.join(APP_ROOT, "dist");

const REPOSITORY_URL = "https://github.com/ericauzenne/tidy";

process.env.APP_ROOT = APP_ROOT;
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(APP_ROOT, "public") : RENDERER_DIST;

function configureAboutPanel(): void {
  app.setAboutPanelOptions({
    applicationName: "Tidy",
    applicationVersion: app.getVersion(),
    copyright: `Copyright © ${new Date().getFullYear()} Eric Auzenne`,
  });
}

const scheduledLaunch = process.argv.includes(SCHEDULED_RUN_FLAG);
if (!app.requestSingleInstanceLock({ scheduledLaunch })) app.quit();
else {
  if (scheduledLaunch && process.platform === "darwin") app.setActivationPolicy("accessory");

  let launchInfo: Partial<Electron.NotificationResponse> | undefined;
  app.once("ready", (_event, info) => { launchInfo = info; });
  const ready = app.whenReady().then(() => {
    loadRenameCache();
    configureAboutPanel();
    const automation = registerIpcHandlers();
    setupMenu({
      repositoryUrl: REPOSITORY_URL,
      helpPath: path.join(process.env.VITE_PUBLIC!, "help.html"),
    });
    automation.restoreNotificationActions(launchInfo);
    return automation;
  });
  let showInterface = false;
  const addMenuBar = () => setupMenuBar(path.join(APP_ROOT, app.isPackaged ? "build/icon.png" : "assets/icon.png"), openWindow);
  function openWindow() {
    showInterface = true;
    if (process.platform === "darwin") app.setActivationPolicy("regular");
    const window = getMainWindow() ?? createWindow(RENDERER_DIST);
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
  void ready.then(async automation => {
    if (scheduledLaunch) {
      let keepNotification = false;
      try { keepNotification = await automation.runSavedSchedule() && app.isPackaged && process.platform === "darwin"; }
      finally {
        // Electron dismisses owned notifications when it exits. Keep the
        // menu bar process available so the user can act on the result.
        if (keepNotification) {
          addMenuBar();
          automation.startSavedWatch();
        } else if (!showInterface) app.quit();
      }
    } else {
      automation.startSavedWatch();
      addMenuBar();
      if (process.platform === "darwin" && app.isPackaged && app.getLoginItemSettings().wasOpenedAtLogin) {
        app.setActivationPolicy("accessory");
      } else {
        openWindow();
      }
    }
  });
  app.on("second-instance", (_event, _args, _directory, data) => {
    const runInBackground = (data as { scheduledLaunch?: boolean } | undefined)?.scheduledLaunch;
    void ready.then(automation => {
      if (runInBackground === true) return automation.runSavedSchedule();
      automation.startSavedWatch();
      addMenuBar();
      openWindow();
    });
  });
  app.on("activate", () => {
    if (showInterface) void ready.then(openWindow);
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
