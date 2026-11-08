import { useRef } from "react";
import { Sparkles, ArrowRight } from "../icons";
import type { AiFeedback } from "../../types";
const EXAMPLE_PROMPTS = ["Organize PDFs from Downloads", "Sort images into smart folders", "Find duplicate files", "Suggest better file names"] as const;
interface AiCommandBarProps {
    value: string;
    onValueChange: (value: string) => void;
    onSubmit: () => void;
    busy: boolean;
    feedback: AiFeedback | null;
    onOpenAdvanced: () => void;
}
export function AiCommandBar({ value, onValueChange, onSubmit, busy, feedback, onOpenAdvanced }: AiCommandBarProps) {
    const input = useRef<HTMLTextAreaElement>(null);
    return <section aria-label="Ask Tidy AI"><div className="tidy-surface tidy-ai-card">
  <div className="tidy-ai-heading"><Sparkles className="w-5 h-5" aria-hidden="true"/><h2>Ask Tidy AI</h2><span className="tidy-ai-badge">AI assisted</span></div>
  {feedback && <p role="status" className="tidy-ai-feedback" data-tone={feedback.type}>{feedback.message}</p>}
  <div className="tidy-ai-input"><label htmlFor="nl-inline-input" className="sr-only">Describe what you'd like Tidy to do</label><textarea ref={input} className="tidy-textbox" id="nl-inline-input" aria-label="Natural language rule input — press Enter to review" rows={2} maxLength={8000} placeholder="Describe how you want to organize your files…" value={value} disabled={busy} onChange={event => onValueChange(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        if (value.trim() && !busy)
            onSubmit();
    } }}/><button className="tidy-primary" id="nl-send-btn" type="button" disabled={!value.trim() || busy} onClick={onSubmit} aria-label="Review AI rule"><ArrowRight className="w-4 h-4" aria-hidden="true"/>{busy ? "Working…" : "Review"}</button></div>
  {!value && !busy && <div className="tidy-ai-examples">{EXAMPLE_PROMPTS.map(prompt => <button key={prompt} type="button" className="tidy-button" onClick={() => { onValueChange(prompt); input.current?.focus(); }}>{prompt}</button>)}</div>}
  <div className="tidy-ai-footer"><p>{busy ? "Processing your request…" : "Enter to review · Shift+Enter for a new line"}</p><button className="tidy-link" type="button" disabled={busy} onClick={onOpenAdvanced}>Advanced editor</button></div>
 </div></section>;
}
