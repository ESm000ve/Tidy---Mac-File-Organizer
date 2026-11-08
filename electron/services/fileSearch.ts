import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { walkSourceFiles } from "../lib/files";

const run = promisify(execFile);
const STOP_WORDS = new Set("a an and can could document file files find for from i in is look me my of on please search show tell that the to where with you".split(" "));
const ALIASES: Record<string, string[]> = {
  lease: ["rental", "tenancy"], rental: ["lease", "tenancy"], tenancy: ["lease", "rental"],
  agreement: ["contract"], contract: ["agreement"], receipt: ["invoice"], invoice: ["receipt"],
  photo: ["picture", "image"], photos: ["picture", "image", "photos"],
};

function words(value: string): string[] {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export interface FileSearchResult {
  path: string;
  name: string;
  relativePath: string;
}

export async function searchOrganizedFiles(destination: string, query: string): Promise<FileSearchResult[]> {
  if (!path.isAbsolute(destination)) throw new Error("Choose a destination folder before searching.");
  const terms = [...new Set(words(query.slice(0, 250)))].filter(word => !STOP_WORDS.has(word)).slice(0, 8);
  if (!terms.length) return [];
  const groups = terms.map(term => [term, ...(Object.hasOwn(ALIASES, term) ? ALIASES[term] : [])]);
  const root = await realpath(destination);
  if (!(await lstat(root)).isDirectory()) throw new Error("Choose an organized folder to search.");
  const candidates = new Map<string, number>();
  const matches = (tokens: string[], term: string) => tokens.includes(term) || tokens.includes(term + "s") || tokens.includes(term + "es");
  const rank = (relative: string) => {
    const filename = words(path.basename(relative, path.extname(relative)));
    const folder = words(path.dirname(relative));
    return groups.reduce((score, alternatives) => score +
      (matches(filename, alternatives[0]) ? 6 : alternatives.some(term => matches(filename, term)) ? 4 :
        alternatives.some(term => matches(folder, term)) ? 2 : 0), 0);
  };

  if (process.platform === "darwin") {
    // Query tokens contain letters and digits only. No user syntax enters the expression.
    const expression = groups.map(group => "(" + group.flatMap(term => [
      `kMDItemFSName == "*${term}*"cd`, `kMDItemTextContent == "*${term}*"cd`,
    ]).join(" || ") + ")").join(" && ");
    try {
      const { stdout } = await run("/usr/bin/mdfind", ["-0", "-onlyin", root, expression], { timeout: 6000, maxBuffer: 2 * 1024 * 1024 });
      for (const file of stdout.split("\0").slice(0, 1000)) {
        if (!file) continue;
        const relative = path.relative(root, file);
        if (!relative || relative === ".." || path.isAbsolute(relative) ||
            relative.split(path.sep).some(part => part === ".Tidy Undo" || part.startsWith("."))) continue;
        candidates.set(file, rank(relative) + groups.length * 3);
      }
    } catch { /* Fall back to names when Spotlight is unavailable or disabled. */ }
  }
  try {
    let scanned = 0;
    for await (const file of walkSourceFiles(root, { includeSubfolders: true, excludeHidden: true })) {
      if (++scanned > 10000) break;
      const score = rank(file.relativePath);
      if (score > 0 && !candidates.has(file.path)) candidates.set(file.path, score);
    }
  } catch (error) {
    if (!candidates.size) throw error;
  }

  const results: FileSearchResult[] = [];
  for (const [file] of [...candidates].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    try {
      if (!(await lstat(file)).isFile() || await realpath(file) !== file) continue;
      results.push({ path: file, name: path.basename(file), relativePath: path.relative(root, file) });
      if (results.length === 40) break;
    } catch { /* A result can disappear while its Spotlight entry is still indexed. */ }
  }
  return results;
}
