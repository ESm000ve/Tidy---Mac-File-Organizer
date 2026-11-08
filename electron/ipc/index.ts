/**
 * Registration point for every IPC handler.
 *
 * `main.ts` calls {@link registerIpcHandlers} once at startup; each module
 * below owns one area of the renderer contract defined in `src/electron.d.ts`.
 */
import { registerDialogHandlers } from "./dialogs";
import { registerOrganizeHandlers } from "./organize";
import { registerRuleHandlers } from "./rules";
import { registerScheduleHandlers } from "./schedule";
import { registerSystemHandlers } from "./system";
import { registerApiKeyHandlers } from "./apiKey";

export function registerIpcHandlers() {
  registerApiKeyHandlers();
  registerSystemHandlers();
  registerDialogHandlers();
  const runScheduledOrganize = registerOrganizeHandlers();
  const runSavedSchedule = registerScheduleHandlers(runScheduledOrganize);
  registerRuleHandlers();
  return runSavedSchedule;
}
