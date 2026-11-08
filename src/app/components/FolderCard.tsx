import { useState, useRef, useEffect } from "react";
import { Folder, Upload, X } from "./icons";
interface FolderCardProps {
    label: string;
    path: string;
    onPathChange: (path: string) => void;
    onSelect: () => void;
    icon?: React.ReactNode;
    accentColor?: "blue" | "emerald";
}
export function FolderCard({ label, path, onPathChange, onSelect }: FolderCardProps) {
    const [dragging, setDragging] = useState(false);
    const [editing, setEditing] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => { if (editing) {
        input.current?.focus();
        input.current?.select();
    } }, [editing]);
    const drop = (event: React.DragEvent) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) {
        const value = window.electron?.getPathForFile(file);
        if (value)
            onPathChange(value);
    } };
    return <div className="tidy-folder-card tidy-surface" data-dragging={dragging} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node))
        setDragging(false); }} onDrop={drop}>
    <div className="tidy-folder-icon" aria-hidden="true">{dragging ? <Upload className="w-8 h-8"/> : <Folder className="w-8 h-8"/>}</div>
    <div className="tidy-folder-copy">
      <h3 id={`folder-${label}`}>{label}</h3>
      {!path ? <><p>{dragging ? "Drop the folder here" : "Choose a folder or drag it here."}</p><button type="button" className="tidy-button" onClick={onSelect} aria-label={`Browse… ${label} folder`}>Browse…</button></> : <>
        {editing ? <input className="tidy-textbox w-full" ref={input} aria-label={`Edit ${label} path: ${path}`} value={path} onChange={event => onPathChange(event.target.value)} onBlur={() => setEditing(false)} onKeyDown={event => { if (event.key === "Enter" || event.key === "Escape")
            setEditing(false); }}/> : <button className="tidy-path" type="button" title={path} aria-label={`Edit ${label} path: ${path}`} onClick={() => setEditing(true)}>{path}</button>}
        <button type="button" className="tidy-button" onClick={onSelect} aria-label={`Change folder… ${label}`}>Change folder…</button>
      </>}
    </div>
    {path && <button type="button" className="tidy-icon-button" title="Clear folder" aria-label={`Clear ${label} path`} onClick={() => onPathChange("")}><X className="w-4 h-4" aria-hidden="true"/></button>}
  </div>;
}
