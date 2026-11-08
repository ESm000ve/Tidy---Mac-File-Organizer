import { useEffect, useState } from "react";

export function ApiKeySettings() {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<{ configured: boolean; saved: boolean; environment: boolean; unreadable: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const available = typeof window.electron?.getApiKeyStatus === "function";
  useEffect(() => {
    if (available) void window.electron!.getApiKeyStatus().then(setStatus).catch(() => { setMessage("Could not read AI settings."); setFailed(true); });
  }, [available]);

  async function act(action: "save" | "remove" | "test") {
    if (!window.electron) return;
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const result = await (action === "save" ? window.electron.saveApiKey(key) : action === "remove" ? window.electron.removeApiKey() : window.electron.testApiKey());
      if (!result.success) { setFailed(true); setMessage(result.error || "Please try again."); return; }
      if (action === "save") setKey("");
      setStatus(await window.electron.getApiKeyStatus());
      setMessage(action === "save" ? "Key saved securely. Use Test connection to verify it." : action === "remove" ? "Saved key removed. An environment key, if present, still applies." : "Connected to Gemini. Your API key works.");
    } catch { setFailed(true); setMessage("Could not update AI settings. Please try again."); }
    finally { setBusy(false); }
  }

  return <section className="tidy-settings-group" aria-labelledby="settings-ai">
    <h3 id="settings-ai">AI connection</h3>
    <div className="tidy-api-key">
      <p>{!available ? "Open the desktop app to configure AI." : status?.saved ? "Using your saved Gemini key." : status?.environment ? "Using a key from the app environment." : "No API key configured."}</p>
      {status?.unreadable && <p role="alert">The saved key could not be read. Save it again on this account.</p>}
      <label htmlFor="gemini-key">Gemini API key</label>
      <input id="gemini-key" type="password" autoComplete="off" spellCheck={false} maxLength={200} value={key} disabled={!available || busy} onChange={event => setKey(event.target.value)} aria-describedby="gemini-key-help" placeholder={status?.saved ? "Enter a replacement key" : "Paste your API key"} />
      <p id="gemini-key-help" className="tidy-settings-note">Saved with system encryption for your account. AI uses Google's online service; Smart rename and Smart sort may send supported file contents. Connection testing sends only a short test message.</p>
      <div className="tidy-api-actions">
        <button type="button" className="tidy-button" disabled={!available || busy || !key.trim()} onClick={() => void act("save")}>Save key</button>
        <button type="button" className="tidy-button" disabled={!available || busy || !status?.configured} onClick={() => void act("test")}>{busy ? "Please wait…" : "Test connection"}</button>
        {status?.saved && <button type="button" className="tidy-button" disabled={busy} onClick={() => void act("remove")}>Remove saved key</button>}
      </div>
      {message && <p role={failed ? "alert" : "status"}>{message}</p>}
    </div>
  </section>;
}
