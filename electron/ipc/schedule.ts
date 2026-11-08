/** Persisted schedules and macOS launch-on-demand registration. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app, ipcMain, Notification } from "electron";
import schedule from "node-schedule";
import { CHANNELS } from "../channels";
import type { registerOrganizeHandlers } from "./organize";
import type { OrganizeRequest, ScheduleSettings } from "../types";
import { getMainWindow, sendToRenderer } from "../window";
import { watchArrivals } from "../services/folderWatch";

const AGENT_LABEL = "com.ericauzenne.tidy.schedule";
export const SCHEDULED_RUN_FLAG = "--tidy-scheduled-run";
const UNDO_NOTIFICATION_PREFIX = "tidy-undo-";

function calendarFor({ frequency, time }: ScheduleSettings) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [Hour, Minute] = time.split(":").map(Number);
  switch (frequency) {
    case "daily": return { Hour, Minute };
    case "weekly": return { Hour, Minute, Weekday: 1 };
    case "monthly": return { Hour, Minute, Day: 1 };
    default: return null;
  }
}

function updateLaunchAgent(calendar: ReturnType<typeof calendarFor>): void {
  const directory = path.join(app.getPath("home"), "Library", "LaunchAgents");
  const userData = app.getPath("userData");
  const profile = createHash("sha256").update(userData).digest("hex").slice(0, 16);
  const label = `${AGENT_LABEL}.${profile}`;
  const plist = path.join(directory, label + ".plist");
  const domain = `gui/${process.getuid!()}`;
  const service = `${domain}/${label}`;
  const launchctl = (...args: string[]) => execFileSync("/bin/launchctl", args, { stdio: "pipe", timeout: 5000 });

  let loaded = false;
  try { launchctl("print", service); loaded = true; }
  catch { /* The job is absent on first use. */ }

  if (!calendar) {
    if (loaded) launchctl("bootout", service);
    fs.rmSync(plist, { force: true });
    return;
  }

  const xmlEscape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const bundle = path.resolve(process.execPath, "../../..");
  // Launch Services detaches Tidy from this calendar job. The next tick can
  // still fire even if the app stays open in the menu bar after notifying.
  const args = ["/usr/bin/open", "-n", "-g", "-a", bundle, "--args", SCHEDULED_RUN_FLAG, `--user-data-dir=${userData}`];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>AssociatedBundleIdentifiers</key><array><string>com.ericauzenne.tidy</string></array>
<key>ProgramArguments</key><array>${args.map(arg => `<string>${xmlEscape(arg)}</string>`).join("")}</array>
<key>StartCalendarInterval</key><dict>${Object.entries(calendar).map(([key, value]) => `<key>${key}</key><integer>${value}</integer>`).join("")}</dict>
</dict></plist>
`;
  if (loaded && fs.existsSync(plist) && fs.readFileSync(plist, "utf8") === xml) return;
  if (loaded) launchctl("bootout", service);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(plist + ".tmp", xml, { mode: 0o600 });
  fs.renameSync(plist + ".tmp", plist);
  launchctl("bootstrap", domain, plist);
}

let activeUndoNotification: Notification | undefined;
let activeStatusNotification: Notification | undefined;

function notify(title: string, body: string, undo?: { id: string; apply: () => void }): Promise<boolean> {
  if (!Notification.isSupported()) return Promise.resolve(false);
  return new Promise(resolve => {
    const notification = new Notification({
      title,
      body,
      ...(undo && process.platform === "darwin" ? {
        id: UNDO_NOTIFICATION_PREFIX + undo.id,
        actions: [{ type: "button", text: "Undo" }],
      } : {}),
    });
    const timeout = setTimeout(() => resolve(false), 2000);
    const done = (shown: boolean) => { clearTimeout(timeout); resolve(shown); };
    notification.once("show", () => done(true));
    notification.once("failed", () => done(false));
    if (undo && process.platform === "darwin") {
      activeUndoNotification?.close();
      activeUndoNotification = notification;
      notification.on("action", (_event, index) => {
        if (index === 0) undo.apply();
      });
    } else {
      activeStatusNotification?.close();
      activeStatusNotification = notification;
    }
    notification.show();
  });
}

export function registerScheduleHandlers(organizer: ReturnType<typeof registerOrganizeHandlers>) {
  const configPath = path.join(app.getPath("userData"), "organize-schedule.json");
  const useLaunchAgent = app.isPackaged && process.platform === "darwin";
  let currentJob: schedule.Job | null = null;
  let watcher: ReturnType<typeof watchArrivals> | undefined;
  let watchKey = "";
  organizer.setOnRestored(filePath => watcher?.ignore(filePath));

  function configureWatch(config: OrganizeRequest | undefined) {
    const { schedule: _schedule, renames: _renames, ...watchConfig } = config ?? {} as OrganizeRequest;
    const key = config?.watchEnabled ? JSON.stringify(watchConfig) : "";
    if (watchKey === key) return;
    watcher?.stop();
    watcher = undefined;
    watchKey = key;
    if (!key) return;
    watcher = watchArrivals(watchConfig, async arrivals => {
      const { result, summary, busy } = await organizer.runInBackground(watchConfig, arrivals);
      if (summary) sendToRenderer(CHANNELS.scheduledRunComplete, summary);
      if (!result.success && !busy) console.error("Folder watch could not organize arrivals:", result.error);
      if (result.errors) sendToRenderer(CHANNELS.automationNotice, `Tidy could not organize ${result.errors} new file(s).`);
      return !busy;
    }, error => {
      console.warn("Folder watch could not scan the source.", error);
      sendToRenderer(CHANNELS.automationNotice, "Tidy could not scan the watched folder. It will retry when the folder is available.");
    });
  }

  function startSavedWatch() {
    try { configureWatch(JSON.parse(fs.readFileSync(configPath, "utf8"))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Could not load folder watching.", error);
    }
  }
  app.on("will-quit", () => watcher?.stop());

  async function undoFromNotification(id: string) {
    const result = await organizer.undoBackgroundRun(id);
    if (result.success && activeUndoNotification?.id === UNDO_NOTIFICATION_PREFIX + id) {
      activeUndoNotification.close();
      activeUndoNotification = undefined;
    }
    const message = result.success ? `Reversed ${"reverted" in result ? result.reverted : 0} operation(s).` :
      ("error" in result ? result.error : undefined) ?? "Some files could not be restored. Open Tidy to review the remaining Undo record.";
    if (getMainWindow()) sendToRenderer(CHANNELS.automationNotice, message);
    else await notify("Tidy Undo", message);
  }

  function restoreNotificationActions(launchInfo?: Partial<Electron.NotificationResponse>) {
    if (process.platform !== "darwin") return;
    const undoId = (identifier: string | undefined) => identifier?.startsWith(UNDO_NOTIFICATION_PREFIX)
      ? identifier.slice(UNDO_NOTIFICATION_PREFIX.length) : undefined;
    const launchId = undoId(launchInfo?.identifier);
    if (launchId && launchInfo?.actionIdentifier === "ACTION_0") void undoFromNotification(launchId);
    const currentId = organizer.getBackgroundUndoId();
    if (!currentId) return;
    void Notification.getHistory().then(history => {
      if (activeUndoNotification) return;
      const previous = history.find(notification => undoId(notification.id) === currentId);
      if (!previous) return;
      activeUndoNotification = previous;
      previous.on("action", (_event, index) => {
        if (index === 0) void undoFromNotification(currentId);
      });
    }).catch(error => console.warn("Could not restore Tidy notification actions.", error));
  }

  async function runSavedSchedule(): Promise<boolean> {
    let config: OrganizeRequest;
    try { config = JSON.parse(fs.readFileSync(configPath, "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      console.error("Could not load the scheduled run.", error);
      return notify("Tidy scheduled run failed", "Tidy could not read its saved schedule.");
    }
    const settings = config?.schedule;
    if (!settings?.enabled || !calendarFor(settings)) return false;
    const start = settings.date ? new Date(settings.date).getTime() : 0;
    if (!Number.isFinite(start) || start > Date.now()) return false;
    const { result, summary, undoSaved } = await organizer.runInBackground(config);
    if (summary) sendToRenderer(CHANNELS.scheduledRunComplete, summary);
    if (!result.success) {
      return notify("Tidy scheduled run failed", result.error ?? "Open Tidy to check your schedule.");
    }
    const body = (config.organizationMode === "tags" ? `Tagged ${result.tagged ?? 0} file(s).` : `Moved ${result.moved ?? 0} file(s).`) +
      (result.trashed ? ` Sent ${result.trashed} duplicate(s) to Trash.` : "") +
      (result.errors ? ` ${result.errors} file(s) could not be processed.` : "") +
      (summary ? undoSaved ? " Open Tidy to undo this run." : " Tidy could not save Undo for a restart." : "");
    const id = summary?.undoId;
    return notify("Tidy scheduled run complete", body, id ? { id, apply: () => void undoFromNotification(id) } : undefined);
  }

  ipcMain.handle(CHANNELS.scheduleSave, (_event, config: OrganizeRequest) => {
    const settings = config.schedule;
    try {
      const hasFolders = Boolean(config.sourcePath && (config.organizationMode === "tags" || config.destPath));
      const scheduled = hasFolders && settings?.enabled && settings.frequency !== "manual";
      const calendar = scheduled && settings ? calendarFor(settings) : null;
      const start = settings?.date ? new Date(settings.date) : new Date();
      if (scheduled && (!calendar || Number.isNaN(start.getTime()))) {
        return { success: false, error: "Choose a valid schedule date and time." };
      }
      const savedConfig = { ...config, renames: undefined };
      if (!hasFolders || (!scheduled && !config.watchEnabled)) {
        fs.rmSync(configPath, { force: true });
        configureWatch(undefined);
      } else {
        if (!path.isAbsolute(config.sourcePath) || (config.organizationMode !== "tags" && !path.isAbsolute(config.destPath))) {
          return { success: false, error: "Choose valid folders for automation." };
        }
        fs.writeFileSync(configPath + ".tmp", JSON.stringify(savedConfig), { mode: 0o600 });
        fs.renameSync(configPath + ".tmp", configPath);
        configureWatch(savedConfig);
      }
      if (!calendar) {
        currentJob?.cancel();
        currentJob = null;
        if (useLaunchAgent) updateLaunchAgent(null);
        return { success: true, message: "Schedule disabled" };
      }

      if (useLaunchAgent) {
        updateLaunchAgent(calendar);
      } else {
        // Keep live schedules available in development and on other platforms.
        currentJob?.cancel();
        const { Hour, Minute, Day, Weekday } = calendar;
        const rule = `${Minute} ${Hour} ${Day ?? "*"} * ${Weekday ?? "*"}`;
        currentJob = schedule.scheduleJob({ rule, start }, runSavedSchedule);
        if (!currentJob) return { success: false, error: "The scheduler rejected that time." };
      }
      return { success: true, message: "Scheduled successfully" };
    } catch (error) {
      console.error("Could not update the schedule.", error);
      return { success: false, error: "Tidy could not update the schedule. Check macOS background activity settings and try again." };
    }
  });

  return { runSavedSchedule, startSavedWatch, restoreNotificationActions };
}
