import fs from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";

const keyPath = () => path.join(app.getPath("userData"), "gemini-key.bin");

/** Secrets stay in the main process and are encrypted for this OS account. */
export function readSavedKey(): string | undefined {
  try {
    return safeStorage.decryptString(fs.readFileSync(keyPath())).trim() || undefined;
  } catch {
    return undefined;
  }
}

export function readEnvironmentKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || undefined;
}

export function apiKeyStatus() {
  const saved = !!readSavedKey();
  const environment = !!readEnvironmentKey();
  return { configured: saved || environment, saved, environment, unreadable: !saved && fs.existsSync(keyPath()) };
}

export function saveApiKey(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(key)) {
    throw new Error("Enter a valid Gemini API key.");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("System secure storage is unavailable. Your key was not saved.");
  }

  const target = keyPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const encrypted = safeStorage.encryptString(key);
  fs.writeFileSync(target + ".tmp", encrypted, { mode: 0o600 });
  fs.renameSync(target + ".tmp", target);
}

export function removeApiKey() {
  fs.rmSync(keyPath(), { force: true });
}
