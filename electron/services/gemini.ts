/**
 * Access to the Gemini API.
 *
 * Saved credentials take priority over the process environment. Settings
 * changes apply to the next request. Development .env changes require restart.
 * Missing credentials are a normal state; naming offers a local fallback.
 */
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { readEnvironmentKey, readSavedKey } from "./apiKey";

/** Fast, cheap, and multimodal — the right trade-off for filename suggestions. */
export const GEMINI_MODEL = "gemini-3.5-flash";
export const MINIMAL_THINKING = { thinkingLevel: ThinkingLevel.MINIMAL };

export function getApiKey(): string | undefined {
  return readSavedKey() ?? readEnvironmentKey();
}

/** A configured client, or `null` when no API key is set. */
export function createClient(): GoogleGenAI | null {
  const apiKey = getApiKey();
  return apiKey ? new GoogleGenAI({ apiKey, httpOptions: { timeout: 30000 } }) : null;
}

/** Provider responses can contain request metadata. Never return or log raw errors. */
export function aiErrorMessage(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 400 || status === 401 || status === 403) return "Gemini could not authorize this request. Check your API key and its API access in Settings.";
  if (status === 429) return "Gemini's usage limit was reached. Check your Google API quota or try again later.";
  if (status === 404) return "The configured Gemini model is unavailable for this API project.";
  return "Gemini could not complete the request. Check your connection and API key, then try again.";
}
