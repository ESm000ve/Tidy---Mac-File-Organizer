import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { FileSearchResult } from "../../electron";
import { Eye, X } from "./icons";

export function OrganizedFileSearch({ folder, onClose }: { folder: string; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileSearchResult[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function search() {
    if (!query.trim() || busy) return;
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const result = await window.electron?.searchOrganizedFiles(folder, query);
      if (!result?.success) throw new Error(result?.error || "File search is available in the desktop app.");
      setResults(result.files ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Tidy could not search that folder.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="tidy-dialog-overlay" />
        <Dialog.Content className="tidy-settings tidy-rule-review">
          <div className="tidy-settings-header">
            <div>
              <Dialog.Title>Find organized files</Dialog.Title>
              <Dialog.Description>Search filenames and text Spotlight has indexed in your organized folder. The search stays on this Mac.</Dialog.Description>
            </div>
            <Dialog.Close className="tidy-icon-button" aria-label="Close file search"><X className="w-4 h-4" aria-hidden="true" /></Dialog.Close>
          </div>
          <div className="tidy-settings-body">
            <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void search(); }}>
              <label className="flex-1 min-w-0 text-sm">Describe a file
                <input className="tidy-textbox w-full mt-1" type="search" maxLength={250} placeholder="Find my lease agreement"
                  value={query} onChange={event => setQuery(event.target.value)} />
              </label>
              <button className="tidy-primary" type="submit" disabled={busy || !query.trim()}>Search</button>
            </form>
            {error && <p role="alert" className="tidy-rule-error">{error}</p>}
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              {busy ? "Searching…" : results ? results.length ? `${results.length} result(s)` : "No matching files found." : ""}
            </p>
            {results && <ul className="divide-y divide-border">
              {results.map(file => <li key={file.path} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="truncate text-xs text-muted-foreground" title={file.relativePath}>{file.relativePath}</p>
                </div>
                <button className="tidy-icon-button" type="button" aria-label={`Quick Look at ${file.name}`}
                  onClick={async () => { if (!await window.electron?.quickLook(file.path)) setError("That file is no longer available to preview."); }}>
                  <Eye className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>)}
            </ul>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
