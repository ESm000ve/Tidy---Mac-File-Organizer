/** Reconcile arrivals even when the filesystem coalesces change events. */
import { promises as fsp, watch } from "node:fs";
import path from "node:path";
import { buildExtensionMap, fileVersion, passesFilters, walkSourceFiles, type SourceFile } from "../lib/files";
import type { OrganizeRequest } from "../types";

const SETTLE_MS = 8000;
const RESCAN_MS = 4000;
const IDLE_RESCAN_MS = 30000;
const PARTIAL_DOWNLOAD = /\.(?:crdownload|download|part|partial|tmp|opdownload|filepart)$/i;

export function watchArrivals(
  config: OrganizeRequest,
  onReady: (files: ReadonlyMap<string, string>) => Promise<boolean>,
  onError: (error: unknown) => void,
  { settleMs = SETTLE_MS, idleRescanMs = IDLE_RESCAN_MS } = {},
): { stop: () => void; ignore: (filePath: string) => void } {
  const rules = buildExtensionMap(config.categories, { enabledOnly: true });
  const known = new Map<string, { version: string; identity: string; since: number; handled: boolean }>();
  const ignored = new Set<string>();
  let initialized = false;
  let scanning = false;
  let stopped = false;
  let reportedError = false;
  let rootIdentity: string | undefined;
  let canonicalRoot: string | undefined;
  let pending = false;
  let lastScan = 0;
  let sourceWatcher: ReturnType<typeof watch> | undefined;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  const scope = { ...config, destPath: config.organizationMode === "tags" ? undefined : config.destPath, excludeHidden: config.filters.excludeHidden };

  async function scan() {
    if (stopped || scanning) return;
    scanning = true;
    lastScan = Date.now();
    try {
      canonicalRoot = await fsp.realpath(config.sourcePath);
      const root = await fsp.stat(canonicalRoot);
      const identity = `${root.dev}:${root.ino}`;
      if (rootIdentity !== identity) {
        known.clear();
        initialized = false;
        rootIdentity = identity;
      }
      const files: SourceFile[] = [];
      for await (const file of walkSourceFiles(config.sourcePath, scope)) files.push(file);
      if (stopped) return;
      const now = Date.now();
      const seen = new Set<string>();
      const ready = new Map<string, string>();
      pending = false;
      for (const file of files) {
        const eligible = !PARTIAL_DOWNLOAD.test(file.name) && rules.has(path.extname(file.name).toLowerCase()) &&
          passesFilters(file.stats, file.name, config.filters);
        const version = fileVersion(file);
        const identity = `${file.stats.dev}:${file.stats.ino}`;
        seen.add(file.path);
        const previous = known.get(file.path);
        const restored = ignored.delete(file.path);
        if (!previous || restored || previous.version !== version) {
          // Existing files and files Tidy already handled stay excluded even
          // if another app later edits them at the same path.
          const handled = !initialized || restored || (previous?.identity === identity && previous.handled);
          known.set(file.path, { version, identity, since: now, handled });
          pending ||= eligible && !handled;
          continue;
        }
        if (!eligible || previous.handled) continue;
        pending = true;
        if (now - previous.since < settleMs || now - file.stats.mtimeMs < settleMs) continue;
        ready.set(file.path, version);
      }
      for (const filePath of known.keys()) if (!seen.has(filePath)) known.delete(filePath);
      initialized = true;
      reportedError = false;
      if (ready.size && await onReady(ready)) {
        for (const [filePath, version] of ready) {
          const entry = known.get(filePath);
          const stats = await fsp.lstat(filePath).catch(() => undefined);
          if (entry && (!stats || fileVersion({ stats }) === version)) entry.handled = true;
        }
      }
    } catch (error) {
      if (!reportedError && !stopped) onError(error);
      reportedError = true;
    } finally {
      scanning = false;
    }
  }

  try {
    sourceWatcher = watch(config.sourcePath, { recursive: config.includeSubfolders === true }, () => {
      clearTimeout(scheduled);
      scheduled = setTimeout(() => void scan(), 250);
    });
    sourceWatcher.on("error", () => sourceWatcher?.close());
  } catch { /* Polling also handles an external drive that reconnects later. */ }
  const poll = setInterval(() => {
    if (pending || Date.now() - lastScan >= idleRescanMs) void scan();
  }, Math.min(RESCAN_MS, settleMs));
  void scan();

  return {
    stop: () => {
      stopped = true;
      clearInterval(poll);
      clearTimeout(scheduled);
      sourceWatcher?.close();
    },
    ignore: filePath => {
      if (!canonicalRoot) return;
      const relative = path.relative(canonicalRoot, filePath);
      if (relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) &&
          (config.includeSubfolders || !relative.includes(path.sep))) ignored.add(filePath);
    },
  };
}
