import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
export type MetadataGrouping = "none" | "website" | "photo-date" | "content-year";
const DOWNLOAD_ORIGINS = '/usr/bin/xattr -px com.apple.metadata:kMDItemWhereFroms "$1" 2>/dev/null | /usr/bin/xxd -r -p | /usr/bin/plutil -convert json -o - -';

const FINDER_TAG_SCRIPT = `
ObjC.import("Foundation");
function run(argv) {
  const [filePath, tag, action] = argv;
  const file = $.NSURL.fileURLWithPath(filePath);
  const value = Ref();
  if (!file.getResourceValueForKeyError(value, $.NSURLTagNamesKey, null)) {
    throw Error("Finder tags could not be read.");
  }
  const tags = ObjC.deepUnwrap(value[0]) || [];
  const index = tags.indexOf(tag);
  if (action === "add" && index === -1) tags.push(tag);
  else if (action === "remove" && index !== -1) tags.splice(index, 1);
  else return "unchanged";
  if (!file.setResourceValueForKeyError($(tags), $.NSURLTagNamesKey, null)) {
    throw Error("Finder tags could not be saved.");
  }
  return "changed";
}
`;

export async function updateFinderTag(filePath: string, tag: string, action: "add" | "remove"): Promise<boolean> {
  if (process.platform !== "darwin") throw new Error("Finder Tags require macOS.");
  const { stdout } = await run("/usr/bin/osascript", ["-l", "JavaScript", "-e", FINDER_TAG_SCRIPT, filePath, tag, action], { timeout: 10000 });
  return stdout.trim() === "changed";
}

const PHOTO_CAPTURE_SCRIPT = `
ObjC.import("Foundation");
ObjC.import("ImageIO");
function run(argv) {
  const source = $.CGImageSourceCreateWithURL($.NSURL.fileURLWithPath(argv[0]), null);
  if (!source) return "";
  const properties = ObjC.deepUnwrap(ObjC.castRefToObject($.CGImageSourceCopyPropertiesAtIndex(source, 0, null)));
  const exif = properties && properties["{Exif}"];
  return (exif && exif.DateTimeOriginal) || "";
}
`;

export async function metadataFolder(filePath: string, grouping: MetadataGrouping | undefined): Promise<string[]> {
  if (process.platform !== "darwin" || !grouping || grouping === "none") return [];
  try {
    if (grouping === "website") {
      // The extended attribute is available before Spotlight indexes a download.
      const origins = await run("/bin/sh", ["-c", DOWNLOAD_ORIGINS, "tidy", filePath], { timeout: 5000 })
        .then(({ stdout }) => JSON.parse(stdout) as string[])
        .catch(async () => {
          const { stdout } = await run("/usr/bin/mdls", ["-raw", "-name", "kMDItemWhereFroms", filePath], { timeout: 5000 });
          return stdout.match(/https?:\/\/[^"\s]+/gi) ?? [];
        });
      for (const origin of origins) {
        const url = URL.parse(origin);
        if (url?.protocol !== "https:" && url?.protocol !== "http:") continue;
        const host = url.hostname.toLowerCase().replace(/\.$/, "");
        if (/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)) return [host];
      }
    } else if (grouping === "photo-date" && /\.(?:avif|heic|heif|jpe?g|png|tiff?|webp|dng|raw)$/i.test(filePath)) {
      const { stdout } = await run("/usr/bin/osascript", ["-l", "JavaScript", "-e", PHOTO_CAPTURE_SCRIPT, filePath], { timeout: 10000 });
      const date = /^(\d{4}):(0[1-9]|1[0-2]):\d{2}\b/.exec(stdout.trim());
      if (date) return [date[1], date[2]];
    }
  } catch { /* Files without readable metadata stay in their usual category. */ }
  return [];
}

export async function contentFolderYear(filePath: string, modifiedMs: number): Promise<string | undefined> {
  const [captureYear] = await metadataFolder(filePath, "photo-date");
  const year = captureYear ?? String(new Date(modifiedMs).getFullYear());
  return /^\d{4}$/.test(year) ? year : undefined;
}
