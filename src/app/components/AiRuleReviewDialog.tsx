import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "./icons";
import type { ClarificationTurn, RuleDraft } from "../lib/ruleReview";

export type AiRuleReview = {
  instruction: string;
  origin: "inline" | "builder" | "folder";
  turns: ClarificationTurn[];
} & ({ kind: "question"; question: string } | { kind: "draft"; draft: RuleDraft });

export function AiRuleReviewDialog({ review, busy, error, onCancel, onClarify, onConfirm }: {
  review: AiRuleReview | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onClarify: (answer: string) => void;
  onConfirm: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const question = review?.kind === "question";
  const confirmLabel = review?.kind === "draft" && review.origin === "inline" && review.draft.openPreview ? "Apply and preview" : "Apply rules";
  return <Dialog.Root open={review !== null} onOpenChange={open => { if (!open && !busy) onCancel(); }}>
    <Dialog.Portal><Dialog.Overlay className="tidy-dialog-overlay" />
      <Dialog.Content className="tidy-settings tidy-rule-review" onOpenAutoFocus={event => { if (question) { event.preventDefault(); document.getElementById("rule-clarification")?.focus(); } }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
        <div className="tidy-settings-header"><div><Dialog.Title>{question ? "One detail first" : review?.origin === "folder" ? "Review folder rules" : "Review AI rule"}</Dialog.Title><Dialog.Description>{question ? "Clarify your instruction before Tidy changes any settings." : review?.origin === "folder" ? "Check the proposed rule set before it replaces your active rules." : "Check how Tidy interpreted your instruction before applying it."}</Dialog.Description></div>
          <button type="button" className="tidy-icon-button" aria-label="Close rule review" disabled={busy} onClick={onCancel}><X className="w-4 h-4" aria-hidden="true" /></button>
        </div>
        <div className="tidy-settings-body" tabIndex={0} role="region" aria-label={question ? "Clarification details" : "Proposed rule details"}>
          <p className="tidy-rule-instruction">{review?.instruction}</p>
          {question && review?.kind === "question" ? <form id="clarify-rule" onSubmit={event => { event.preventDefault(); if (answer.trim() && !busy) onClarify(answer.trim()); }}>
            <label htmlFor="rule-clarification">{review.question}</label>
            <textarea id="rule-clarification" className="tidy-textbox" rows={3} maxLength={2000} value={answer} disabled={busy} onChange={event => setAnswer(event.target.value)} placeholder="Add the missing detail…" />
          </form> : review?.kind === "draft" && <dl className="tidy-rule-summary">{review.draft.summary.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>}
          {error && <p role="alert" className="tidy-rule-error">{error}</p>}
          {!question && <p className="tidy-settings-note">Applying updates your settings. A manual run still requires confirmation in the file preview.</p>}
        </div>
        <div className="tidy-settings-footer"><button type="button" className="tidy-button" disabled={busy} onClick={onCancel}>Cancel</button>
          {question ? <button type="submit" form="clarify-rule" className="tidy-primary" disabled={busy || !answer.trim()}>{busy ? "Working…" : "Continue"}</button> : <button type="button" className="tidy-primary" onClick={onConfirm} disabled={busy}>{confirmLabel}</button>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
