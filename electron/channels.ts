/**
 * IPC channel names, in one place.
 *
 * The main process registers handlers for these and the preload script invokes
 * them; a typo on either side is a runtime no-op, so both import from here.
 */
export const CHANNELS = {
  /** Renderer → main, request/response. */
  openDirectory: "dialog:openDirectory",
  previewFile: "dialog:previewFile",
  quickLook: "dialog:quickLook",
  getSourceChoices: "dialog:getSourceChoices",
  getFolderPreview: "dialog:getFolderPreview",
  getFolderInsights: "dialog:getFolderInsights",
  organizeRun: "organize:run",
  organizeUndo: "organize:undo",
  scheduleSave: "schedule:save",
  scheduledRunSummary: "schedule:run-summary",
  openFolder: "open:folder",
  parseRule: "ai:parseRule",
  suggestFolderRules: "ai:suggestFolderRules",
  searchOrganizedFiles: "organize:search",
  apiKeyStatus: "ai:keyStatus",
  apiKeySave: "ai:keySave",
  apiKeyRemove: "ai:keyRemove",
  apiKeyTest: "ai:keyTest",
  setTheme: "system:setTheme",

  /** Main → renderer, one-way events. */
  organizeProgress: "organize:progress",
  organizeLog: "organize:log",
  scheduledRunComplete: "schedule:run-complete",
  automationNotice: "automation:notice",
  menuAction: "menu:action",
  fullScreenChange: "window:fullscreen-change",
} as const;
