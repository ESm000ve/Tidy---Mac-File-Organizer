import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import type { FileForRename } from "../types";

const run = promisify(execFile);
const OCR_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".heic", ".heif", ".webp", ".tif", ".tiff", ".pdf"]);
const MAX_BYTES = 25 * 1024 * 1024;

export async function readTextsOnDevice(files: FileForRename[]): Promise<Map<string, string[]>> {
  const recognized = new Map<string, string[]>();
  if (process.platform !== "darwin") return recognized;
  const supported = files.filter(file => file.size <= MAX_BYTES && OCR_EXTENSIONS.has(path.extname(file.path).toLowerCase())).slice(0, 50);
  if (!supported.length) return recognized;
  const helper = app.isPackaged ? path.join(process.resourcesPath, "app.asar.unpacked", "build", "tidy-ocr") :
    path.join(app.getAppPath(), "build", "tidy-ocr");
  let output = "";
  try {
    const { stdout } = await run(helper, supported.map(file => file.path), { timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
    output = stdout;
  } catch (error) {
    // Keep completed pages if macOS initialization or a slow file used the
    // rest of the time budget.
    const partial = (error as { stdout?: unknown }).stdout;
    if (typeof partial === "string") output = partial;
  }
  for (const [index, row] of output.split("\n").slice(0, supported.length).entries()) {
    if (!row) continue;
    try {
      const lines: unknown = JSON.parse(row);
      if (Array.isArray(lines)) recognized.set(supported[index].id, lines.filter((line): line is string => typeof line === "string").slice(0, 30));
    } catch { /* An interrupted helper can leave a final incomplete row. */ }
  }
  return recognized;
}
