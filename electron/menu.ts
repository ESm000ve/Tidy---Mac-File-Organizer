/**
 * The native application menu bar.
 *
 * Menu items do not act directly: each sends a {@link MenuAction} to the
 * renderer, which owns the state the action affects. That keeps one
 * implementation of "run Tidy" rather than a menu copy and a button copy.
 */
import { app, BrowserWindow, dialog, Menu, nativeImage, shell, Tray, type MenuItemConstructorOptions } from "electron";
import { CHANNELS } from "./channels";
import { sendToRenderer } from "./window";

/** Actions the renderer knows how to handle. Mirrors `MenuAction` there. */
type MenuAction =
  | "open-preferences"
  | "run-tidy"
  | "reset-rules"
  | "open-source"
  | "open-destination"
  | "toggle-insights"
  | "toggle-audit"
  | "clear-search"
  | "undo-organize";

interface MenuOptions {
  /** Repository URL used by the Help menu. */
  repositoryUrl: string;
  helpPath: string;
}

function dispatch(action: MenuAction) {
  return () => sendToRenderer(CHANNELS.menuAction, action);
}

let helpWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

export function setupMenuBar(iconPath: string, openWindow: () => void): void {
  if (process.platform !== "darwin" || tray) return;
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  if (icon.isEmpty()) return;
  tray = new Tray(icon);
  tray.setToolTip("Tidy");
  function refresh() {
    const packaged = app.isPackaged;
    const login = packaged ? app.getLoginItemSettings() : undefined;
    tray?.setContextMenu(Menu.buildFromTemplate([
      { label: "Open Tidy", click: openWindow },
      {
        label: "Launch at Login", type: "checkbox", enabled: packaged,
        checked: login?.openAtLogin || login?.status === "requires-approval",
        click: item => {
          try {
            app.setLoginItemSettings({ openAtLogin: item.checked });
            if (item.checked && app.getLoginItemSettings().status === "requires-approval") {
              void dialog.showMessageBox({
                type: "info", message: "Allow Tidy to launch at login",
                detail: "Enable Tidy under System Settings → General → Login Items & Extensions.",
              });
            }
          } catch {
            void dialog.showMessageBox({ type: "error", message: "Tidy could not update its login item." });
          }
          refresh();
        },
      },
      { type: "separator" },
      { role: "quit", label: "Quit Tidy" },
    ]));
  }
  refresh();
}

function openHelp(helpPath: string) {
  if (helpWindow) {
    if (helpWindow.isMinimized()) helpWindow.restore();
    helpWindow.show();
    helpWindow.focus();
    return;
  }

  const window = new BrowserWindow({
    title: "Tidy Help",
    width: 760,
    height: 720,
    minWidth: 360,
    minHeight: 360,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  helpWindow = window;
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", event => event.preventDefault());
  window.on("closed", () => { helpWindow = null; });
  void window.loadFile(helpPath).then(() => {
    if (!window.isDestroyed()) window.show();
  }).catch(() => {
    if (window.isDestroyed()) return;
    window.close();
    dialog.showErrorBox("Tidy Help could not open", "The bundled help page could not be loaded.");
  });
}

function buildTemplate({ repositoryUrl, helpPath }: MenuOptions): MenuItemConstructorOptions[] {
  // Developer tools are gated on the packaged flag so they never ship.
  const developerItems: MenuItemConstructorOptions[] = app.isPackaged
    ? []
    : [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
      ];

  return [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Settings…", accelerator: "Command+,", click: dispatch("open-preferences") },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" }, { role: "hideOthers" }, { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        { label: "Select Source Folder…", accelerator: "Command+O", click: dispatch("open-source") },
        {
          label: "Select Destination Folder…",
          accelerator: "Command+Shift+O",
          click: dispatch("open-destination"),
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "Actions",
      submenu: [
        { label: "Run Tidy", accelerator: "Command+Enter", click: dispatch("run-tidy") },
        // Deliberately without a shortcut: it discards the user's whole rule set.
        { label: "Reset All Rules…", click: dispatch("reset-rules") },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { label: "Undo Last Organize", accelerator: "Command+Alt+Z", click: dispatch("undo-organize") },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Show Insights", accelerator: "Command+I", click: dispatch("toggle-insights") },
        { label: "Show Audit Log", accelerator: "Command+L", click: dispatch("toggle-audit") },
        { type: "separator" },
        { label: "Clear Search", accelerator: "Command+K", click: dispatch("clear-search") },
        { type: "separator" },
        ...developerItems,
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "Tidy Help", click: () => openHelp(helpPath) },
        { type: "separator" },
        { label: "Documentation", click: () => void shell.openExternal(`${repositoryUrl}#readme`) },
        { type: "separator" },
        { label: "Report an Issue", click: () => void shell.openExternal(`${repositoryUrl}/issues`) },
      ],
    },
  ];
}

/** Install the application menu. */
export function setupMenu(options: MenuOptions): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate(options)));
}
