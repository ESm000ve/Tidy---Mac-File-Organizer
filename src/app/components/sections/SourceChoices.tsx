import { useEffect, useState } from "react";
import { Refresh } from "../icons";
import { Check, Document, Folder, Search } from "../icons";

interface Props {
  sourcePath: string;
  destPath: string;
  includeSubfolders: boolean;
  excludeHidden: boolean;
  fileExtensions: string[];
  selectedSourceFolders: string[] | null;
  selectedFileExtensions: string[] | null;
  onSelectionChange: (folders: string[] | null, types: string[] | null) => void;
}

export function SourceChoices(props: Props) {
  const { sourcePath, destPath, includeSubfolders, excludeHidden, fileExtensions, selectedSourceFolders, selectedFileExtensions, onSelectionChange } = props;
  const [folders, setFolders] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [typeQuery, setTypeQuery] = useState("");
  const [folderQuery, setFolderQuery] = useState("");
  useEffect(() => { setTypeQuery(""); setFolderQuery(""); }, [sourcePath]);
  useEffect(() => {
    let active = true;
    setFolders([]);
    if (!sourcePath || !includeSubfolders || !window.electron?.getSourceChoices) { setStatus(""); return; }
    setStatus("Loading folders…");
    window.electron.getSourceChoices(sourcePath, { includeSubfolders, destPath, excludeHidden }).then(result => {
      if (active) { setFolders(result); setStatus(""); }
    }).catch(error => { if (active) setStatus(`Could not load folders: ${error instanceof Error ? error.message : String(error)}`); });
    return () => { active = false; };
  }, [sourcePath, destPath, includeSubfolders, excludeHidden, refresh]);
  const toggle = (selection: string[] | null, available: string[], item: string, checked: boolean) => {
    const next = new Set(selection ?? available);
    if (checked) next.add(item); else next.delete(item);
    return [...next];
  };

  const visibleTypes = fileExtensions.filter(ext => ext.toLowerCase().includes(typeQuery.trim().toLowerCase().replace(/^\./, "")));
  const visibleFolders = folders.filter(folder => (folder === "." ? "Main folder" : folder).toLowerCase().includes(folderQuery.trim().toLowerCase()));
  const typeCount = fileExtensions.filter(ext => selectedFileExtensions === null || selectedFileExtensions.includes(ext)).length;
  const folderCount = folders.filter(folder => selectedSourceFolders === null || selectedSourceFolders.includes(folder)).length;
  return <div className={"tidy-source-choices" + (includeSubfolders ? " has-folders" : "")} aria-label="Files and source folders">
    <fieldset className="tidy-selection-panel">
      <legend className="sr-only">File types to move</legend>
      <div className="tidy-selection-heading">
        <Document className="tidy-selection-icon" />
        <h3 aria-hidden="true">File types to move</h3>
        <span className="tidy-selection-count" aria-label={typeCount + " file types selected"}>{typeCount} selected</span>
      </div>
      <p className="tidy-selection-description">Choose the types to collect from your source folders.</p>
      <div className="tidy-selection-toolbar">
        <label className="tidy-selection-search"><Search /><input aria-label="Find file types" placeholder="Find a file type" value={typeQuery} onChange={e => setTypeQuery(e.target.value)} /></label>
        <div className="tidy-selection-actions">
          <button type="button" aria-label="All file types" className="tidy-selection-action" onClick={() => onSelectionChange(selectedSourceFolders, null)}>Select all</button>
          <button type="button" aria-label="Clear file types" className="tidy-selection-action" onClick={() => onSelectionChange(selectedSourceFolders, [])}>Clear</button>
        </div>
      </div>
      <div className="tidy-type-list" role="group" aria-label="File type selection">
        {visibleTypes.map(ext => {
          const checked = selectedFileExtensions === null || selectedFileExtensions.includes(ext);
          return <label key={ext} className="tidy-type-option tidy-choice" data-selected={checked}>
            <span className="tidy-checkbox"><input type="checkbox" checked={checked} onChange={e => onSelectionChange(selectedSourceFolders, toggle(selectedFileExtensions, fileExtensions, ext, e.target.checked))} /><Check /></span>
            <span>.{ext}</span>
          </label>;
        })}
        {fileExtensions.length > 0 && !visibleTypes.length && <p className="tidy-selection-empty">No matching file types.</p>}
        {!fileExtensions.length && <p className="tidy-selection-empty">Enable a category in Automated rules to choose its file types.</p>}
      </div>
      <p className="tidy-selection-footnote" role="status">{typeCount === 0 ? "No file types selected. No files will be moved." : "File types enabled in Automated rules. Other filters still apply."}</p>
    </fieldset>
    {includeSubfolders && <fieldset className="tidy-selection-panel">
      <legend className="sr-only">Folders to take files from</legend>
      <div className="tidy-selection-heading">
        <Folder className="tidy-selection-icon" />
        <h3 aria-hidden="true">Folders to take files from</h3>
        <span className="tidy-selection-count" aria-label={folderCount + " source folders selected"}>{folderCount} selected</span>
      </div>
      <p className="tidy-selection-description">Choose folders individually, including any deeper folders.</p>
      <div className="tidy-selection-toolbar">
        <label className="tidy-selection-search"><Search /><input aria-label="Find source folders" placeholder="Find a folder" value={folderQuery} onChange={e => setFolderQuery(e.target.value)} /></label>
        <div className="tidy-selection-actions">
          <button type="button" aria-label="All folders" className="tidy-selection-action" onClick={() => onSelectionChange(null, selectedFileExtensions)}>Select all</button>
          <button type="button" aria-label="Clear folders" className="tidy-selection-action" onClick={() => onSelectionChange([], selectedFileExtensions)}>Clear</button>
          <button type="button" className="tidy-icon-button" aria-label="Refresh folders" title="Refresh folders" onClick={() => setRefresh(value => value + 1)}><Refresh aria-hidden="true" /></button>
        </div>
      </div>
      <div className="tidy-source-folder-list" role="group" aria-label="Source folder selection">
        {visibleFolders.map(folder => {
          const checked = selectedSourceFolders === null || selectedSourceFolders.includes(folder);
          const parts = folder.split(/[\\/]/);
          const depth = folder === "." ? 0 : Math.min(parts.length - 1, 4);
          return <label key={folder} className="tidy-folder-option tidy-choice" data-selected={checked} style={{paddingInlineStart: 12 + depth * 16}} title={folder === "." ? sourcePath : folder}>
            <span className="tidy-checkbox"><input type="checkbox" aria-label={folder === "." ? "Main folder (files directly inside)" : parts.join(" › ")} checked={checked} onChange={e => onSelectionChange(toggle(selectedSourceFolders, folders, folder, e.target.checked), selectedFileExtensions)} /><Check /></span>
            <Folder className="tidy-row-folder-icon" />
            <span className="tidy-folder-option-copy"><span>{folder === "." ? "Main folder" : parts[parts.length - 1]}</span>{folder === "." ? <small>Files directly inside</small> : parts.length > 1 && <small>{parts.slice(0, -1).join(" › ")}</small>}</span>
          </label>;
        })}
        {!status && !visibleFolders.length && <p className="tidy-selection-empty">{folderQuery ? "No matching folders." : "No folders available."}</p>}
        {status && <p className="tidy-selection-empty" role="status">{status}</p>}
      </div>
      <p className="tidy-selection-footnote" role="status">{selectedSourceFolders?.length === 0 ? "No source folders selected. No files will be moved." : selectedSourceFolders === null ? "All folders included. Newly added folders are included too." : (folderCount + (folderCount === 1 ? " folder" : " folders") + " selected. Newly added folders stay unselected.")}</p>
    </fieldset>}
  </div>;
}
