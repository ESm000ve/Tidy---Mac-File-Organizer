/**
 * The organize run: the only code in the app that moves the user's files.
 *
 * Two invariants hold throughout. Every completed move is appended to
 * `operations` before the next file is touched. Completed runs can be
 * reversed; this is not a crash recovery journal. And a failure on one file is logged and counted, never
 * thrown — one unreadable file must not abandon the other nine hundred.
 */
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { renameNeedsReview } from "../../src/shared/naming";
import { contentFolderYear, metadataFolder, updateFinderTag } from "../lib/macFileMetadata";
import {
  buildExtensionMap,
  fileVersion,
  fingerprintFile,
  findAvailablePath,
  moveFile,
  passesFilters,
  validatePathSegment,
  walkSourceFiles,
  type SourceFile,
} from "../lib/files";
import type {
  AcceptedRename,
  Operation,
  OrganizeRequest,
  RunCallbacks,
  RunResult,
} from "../types";

/** Files between progress reports. Reporting per file floods the IPC channel. */
const PROGRESS_INTERVAL = 10;

/** Where duplicates go when the conflict policy is "archive". */
const DUPLICATES_FOLDER = "Duplicates_Archive";

/** Where low-confidence AI renames go, for the user to check before filing. */
const REVIEW_FOLDER = "Review";

let fileJobActive = false;

/** Manual runs, schedules, and Undo must never move the same files concurrently. */
export async function runOrganizeJob(request: OrganizeRequest, callbacks: RunCallbacks = {}, arrivals?: ReadonlyMap<string, string>): Promise<RunResult> {
  if (fileJobActive) return { success: false, error: "Tidy is already moving or restoring files. Wait for it to finish." };
  fileJobActive = true;
  try { return await organizeFiles(request, callbacks, arrivals); }
  finally { fileJobActive = false; }
}

/** Accept both the object form and a bare replacement string. */
function readRename(entry: AcceptedRename | string | undefined): AcceptedRename | null {
  if (!entry) return null;
  if (typeof entry === "string") return { suggested: entry };
  return entry;
}

/**
 * Move every matching file from the source folder into the destination,
 * filing it by category and, optionally, by content type.
 *
 * @param request   Source, destination, rules, filters, and accepted renames.
 * @param callbacks Progress and log sinks. Omitted for scheduled runs, which
 *                  have no window to report to.
 */
async function organizeFiles(
  request: OrganizeRequest,
  { onProgress, onLog, trashFile }: RunCallbacks = {},
  arrivals?: ReadonlyMap<string, string>,
): Promise<RunResult> {
  const { sourcePath, destPath, categories, filters, conflictResolution, renames } = request;
  const tagOnly = request.organizationMode === "tags";
  const log = (level: Parameters<NonNullable<RunCallbacks["onLog"]>>[0], message: string) =>
    onLog?.(level, message);

  if (!sourcePath || (!tagOnly && !destPath)) {
    log("error", "Source or destination path missing");
    return { success: false, error: "Source or destination path missing" };
  }

  try {
    log("info", `Scan started — ${sourcePath}`);
    // Finish enumeration before moving anything. An unreadable subtree cannot
    // leave an unreported partial traversal or include freshly produced output.
    const extensionMap = buildExtensionMap(categories, { enabledOnly: true });
    const duplicateSizeCounts = new Map<number, number>();
    const files: SourceFile[] = [];
    for await (const file of walkSourceFiles(sourcePath, { includeSubfolders: request.includeSubfolders === true, selectedSourceFolders: request.selectedSourceFolders, selectedFileExtensions: request.selectedFileExtensions, destPath: tagOnly ? undefined : destPath, excludeHidden: filters.excludeHidden })) {
      if (arrivals && arrivals.get(file.path) !== fileVersion(file)) continue;
      files.push(file);
      const rule = extensionMap.get(path.extname(file.name).toLowerCase());
      if (rule?.duplicateDetection && passesFilters(file.stats, file.name, filters)) {
        const { size } = file.stats;
        duplicateSizeCounts.set(size, (duplicateSizeCounts.get(size) ?? 0) + 1);
      }
    }
    log("info", "Found " + files.length + " source files to process");

    const seenFingerprints = new Set<string>();
    const operations: Operation[] = [];
    const backupDirectory = path.join(destPath, ".Tidy Undo", randomUUID());

    let moved = 0;
    let tagged = 0;
    let trashed = 0;
    let renamed = 0;
    let duplicates = 0;
    let errors = 0;

    for (const [index, file] of files.entries()) {
      const { name: filename, path: sourceFile, relativePath } = file;

      try {
        const stats = await fsp.lstat(sourceFile);
        if (!stats.isFile()) continue;
        if (arrivals && arrivals.get(sourceFile) !== fileVersion({ stats })) continue;
        if (!passesFilters(stats, filename, filters)) continue;

        const extension = path.extname(filename).toLowerCase();
        const rule = extensionMap.get(extension);
        if (!rule) continue;

        let isDuplicate = false;
        if (rule.duplicateDetection && (duplicateSizeCounts.get(stats.size) ?? 0) > 1) {
          try {
            const fingerprint = await fingerprintFile(sourceFile, stats.size);
            isDuplicate = seenFingerprints.has(fingerprint);
            if (isDuplicate) duplicates += 1;
            else seenFingerprints.add(fingerprint);
          } catch (error) {
            console.warn(`Could not fingerprint ${filename}; treating it as unique.`, error);
          }
        }
        if (arrivals && arrivals.get(sourceFile) !== fileVersion({ stats: await fsp.lstat(sourceFile) })) continue;

        if (isDuplicate && conflictResolution === "skip") {
          log("warn", `Skipped duplicate: ${filename}`);
          continue;
        }
        if (isDuplicate && conflictResolution === "trash") {
          if (!trashFile) throw new Error("Trash is unavailable.");
          await trashFile(sourceFile);
          trashed += 1;
          log("info", `Moved duplicate to Trash: ${filename}`);
          continue;
        }

        if (tagOnly) {
          const tag = validatePathSegment(rule.name);
          if (await updateFinderTag(sourceFile, tag, "add")) {
            operations.push({ originalPath: sourceFile, newPath: sourceFile, originalName: filename, newName: filename, finderTag: { name: tag, device: stats.dev, inode: stats.ino } });
            tagged += 1;
            log("info", `Added Finder tag ${tag} to ${filename}`);
          }
          continue;
        }

        let targetFilename = filename;
        let targetDirectory: string;

        if (isDuplicate && conflictResolution === "archive") {
          targetDirectory = path.join(destPath, DUPLICATES_FOLDER);
          log("warn", `${filename} is a duplicate, moving to ${DUPLICATES_FOLDER}`);
        } else {
          const rename = readRename(renames?.[relativePath]);
          let needsReview = false;

          if (rename) {
            targetFilename = validatePathSegment(rename.suggested);
            needsReview = renameNeedsReview(rename.source, rename.confidence, targetFilename !== filename);
          }

          if (needsReview) {
            targetDirectory = path.join(destPath, REVIEW_FOLDER);
          } else {
            targetDirectory = path.join(destPath, validatePathSegment(rule.name));
            const grouping = await metadataFolder(sourceFile, request.metadataGrouping);
            if (grouping.length) {
              targetDirectory = path.join(targetDirectory, ...grouping);
            } else if (rule.subfolders || rule.smartCategorization) {
              const semantic = rule.smartCategorization ? rename?.subfolder : undefined;
              const subfolder = validatePathSegment(semantic || extension.slice(1) || "no_extension");
              if (request.metadataGrouping !== "content-year" || !semantic || subfolder.toLowerCase() !== rule.name.toLowerCase()) {
                targetDirectory = path.join(targetDirectory, subfolder);
              }
              if (semantic && request.metadataGrouping === "content-year") {
                const year = rename?.contentYear && /^(?:19|20)\d{2}$/.test(rename.contentYear)
                  ? rename.contentYear : await contentFolderYear(sourceFile, stats.mtimeMs);
                if (year) targetDirectory = path.join(targetDirectory, year);
              }
            }
          }
        }

        if (arrivals && request.metadataGrouping && request.metadataGrouping !== "none" &&
            arrivals.get(sourceFile) !== fileVersion({ stats: await fsp.lstat(sourceFile) })) continue;
        await fsp.mkdir(targetDirectory, { recursive: true });

        // Resolve a name collision at the destination according to the policy:
        // "rename" finds a free name, "skip" leaves the file where it is, and
        // "overwrite" preserves the replaced file so Undo can restore it.
        let targetPath = path.join(targetDirectory, targetFilename);
        if (path.resolve(sourceFile).toLowerCase() === path.resolve(targetPath).toLowerCase()) continue;
        if (fs.existsSync(targetPath)) {
          if (conflictResolution === "skip") {
            log("warn", `Skipped ${filename} — a file of that name is already filed`);
            continue;
          }
          if (conflictResolution === "rename" || conflictResolution === "archive" || conflictResolution === "trash") {
            targetPath = findAvailablePath(targetDirectory, targetFilename);
          } else if (conflictResolution === "overwrite") {
            const existing = await fsp.lstat(targetPath);
            if (!existing.isFile()) throw new Error("The destination name belongs to a folder or link.");
            await fsp.mkdir(backupDirectory, { recursive: true });
            const backupPath = findAvailablePath(backupDirectory, targetFilename);
            await moveFile(targetPath, backupPath);
            operations.push({ originalPath: targetPath, newPath: backupPath, originalName: targetFilename, newName: path.basename(backupPath) });
            log("info", `Preserved replaced file in .Tidy Undo: ${targetFilename}`);
          }
        }

        if (path.resolve(sourceFile).toLowerCase() === path.resolve(targetPath).toLowerCase()) continue;
        await moveFile(sourceFile, targetPath);

        operations.push({
          originalPath: sourceFile,
          newPath: targetPath,
          originalName: filename,
          newName: path.basename(targetPath),
        });
        moved += 1;
        if (targetFilename !== filename) renamed += 1;

        log(
          "info",
          targetFilename === filename
            ? `Moved ${filename} → ${rule.name}/`
            : `Renamed ${filename} → ${targetFilename} and moved to ${rule.name}/`,
        );
      } catch (error) {
        log("error", `Failed to process ${filename}`);
        console.error(`Failed to process ${filename}:`, error);
        errors += 1;
      } finally {
        if (index % PROGRESS_INTERVAL === 0 || index === files.length - 1) {
          onProgress?.(Math.floor(((index + 1) / files.length) * 100));
        }
      }
    }

    onProgress?.(100);
    log(errors ? "warn" : "success", errors ? `Run finished with ${errors} error(s). Review the log.` : "Run completed — changes recorded for undo");
    return { success: true, moved, tagged, trashed, renamed, duplicates, errors, operations };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log("error", `Organization error: ${message}`);
    console.error("Organization run failed.", error);
    return { success: false, error: message };
  }
}

/**
 * Reverse a run by moving each file back to where it came from.
 *
 * Operations are replayed newest-first so a file moved twice lands back at its
 * true origin. A file the user has since deleted or moved themselves is skipped
 * rather than treated as a failure.
 */
export async function undoOperations(operations: Operation[], onRestored?: (filePath: string) => void) {
  if (fileJobActive) return { success: false, reverted: 0, errors: operations.length, remainingOperations: operations, error: "Tidy is already moving or restoring files. Wait for it to finish." };
  fileJobActive = true;
  try { return await restoreOperations(operations, onRestored); }
  finally { fileJobActive = false; }
}

async function restoreOperations(operations: Operation[], onRestored?: (filePath: string) => void) {
  let reverted = 0;
  let errors = 0;
  const remainingOperations: Operation[] = [];
  const blockedPaths = new Set<string>();
  const identity = (filePath: string) => path.resolve(filePath);
  const defer = (operation: Operation) => {
    errors += 1;
    remainingOperations.unshift(operation);
    blockedPaths.add(identity(operation.originalPath));
    blockedPaths.add(identity(operation.newPath));
  };

  for (const operation of [...operations].reverse()) {
    try {
      // Replacement backups can share paths with older moves. If a newer
      // reversal is blocked, do not restore the wrong version through that path.
      if (!fs.existsSync(operation.newPath)) continue;
      if (blockedPaths.has(identity(operation.originalPath)) || blockedPaths.has(identity(operation.newPath))) { defer(operation); continue; }
      if (operation.finderTag) {
        const stats = await fsp.lstat(operation.newPath);
        if (stats.dev !== operation.finderTag.device || stats.ino !== operation.finderTag.inode || !stats.isFile()) { defer(operation); continue; }
        await updateFinderTag(operation.newPath, operation.finderTag.name, "remove");
        reverted += 1;
        continue;
      }
      if (fs.existsSync(operation.originalPath)) {
        defer(operation);
        continue;
      }
      await moveFile(operation.newPath, operation.originalPath);
      onRestored?.(operation.originalPath);
      reverted += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && !fs.existsSync(operation.newPath)) continue;
      console.error(`Could not revert ${operation.newPath}:`, error);
      defer(operation);
    }
  }

  return { success: errors === 0, reverted, errors, remainingOperations };
}
