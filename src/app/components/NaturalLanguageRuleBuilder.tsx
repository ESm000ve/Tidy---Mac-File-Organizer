import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "motion/react";

import { Check, Sparkles, X } from "./icons";
interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSave: (rule: string) => Promise<void>;
}

export function NaturalLanguageRuleBuilder({ isOpen, onClose, onSave }: Props) {
    const [rule, setRule] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    return (
        <Dialog.Root open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
            <AnimatePresence>
                {isOpen && (
                    <Dialog.Portal forceMount>
                        <Dialog.Overlay asChild>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                            />
                        </Dialog.Overlay>
                        <Dialog.Content asChild onEscapeKeyDown={event => { if (isSubmitting) event.preventDefault(); }} onPointerDownOutside={event => { if (isSubmitting) event.preventDefault(); }}>
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 8 }}
                                transition={{ duration: 0.2, ease: [0, 0, 0, 1] }}
                                className="fixed left-[50%] top-[50%] z-50 w-full max-w-[480px] -translate-x-1/2 -translate-y-1/2"
                            >
                                <Dialog.Title className="sr-only">Ask Tidy AI</Dialog.Title>
                                <Dialog.Description className="sr-only">
                                    Describe your instruction, then review the interpreted rules before applying them.
                                </Dialog.Description>

                                <div
                                    className="tidy-surface overflow-hidden rounded-lg flex flex-col bg-card border border-black/10 dark:border-white/[0.15] shadow-[0_24px_48px_rgba(0,0,0,0.2)] dark:shadow-[0_24px_48px_rgba(0,0,0,0.4)]"
                                    style={{ fontFamily: "var(--font-ui)" }}
                                >
                                    {/* Header */}
                                    <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/[0.08]">
                                        <div className="flex items-center gap-2 text-foreground dark:text-foreground">
                                            <Sparkles className="w-4 h-4 text-[var(--system-purple)]" aria-hidden="true" />
                                            <span className="text-[14px] font-semibold">Ask Tidy AI</span>
                                            {/* HIG Generative AI: Communicate where your app uses AI */}
                                            <span
                                                className="inline-flex items-center gap-[3px] text-[12px] font-semibold text-[var(--system-purple)] bg-[var(--system-purple)]/10 px-1.5 py-0.5 rounded-sm border border-[var(--system-purple)]/20"
                                                title="This feature uses AI to parse your plain-English request and configure your organization rules automatically"
                                                aria-label="Powered by AI"
                                            >
                                                <Sparkles className="w-2 h-2" aria-hidden="true" />
                                                AI
                                            </span>
                                        </div>
                                        <Dialog.Close asChild>
                                            <button
                                                aria-label="Close dialog"
                                                disabled={isSubmitting}
                                                className="text-[var(--tidy-secondary-label)] hover:text-foreground hover:bg-black/5 dark:text-[var(--tidy-secondary-label)] dark:hover:text-foreground transition-colors p-1.5 rounded-lg dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)]"
                                            >
                                                <X className="w-4 h-4" aria-hidden="true" />
                                            </button>
                                        </Dialog.Close>
                                    </div>

                                    {/* Body */}
                                    <div className="p-5 flex flex-col gap-4">
                                        <p className="text-[14px] text-muted-foreground leading-relaxed">
                                            Describe what you want to organize. Review the proposed rules before applying them.
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {[
                                                "Organize PDFs from Downloads",
                                                "Sort images into smart folders",
                                                "Find duplicate files",
                                                "Suggest better file names",
                                            ].map((example) => (
                                                <button
                                                    key={example}
                                                    type="button"
                                                    disabled={isSubmitting}
                                                    onClick={() => setRule(example)}
                                                    className="text-[12px] px-2 py-1 rounded-md bg-[var(--system-purple)]/10 text-[var(--system-purple)] border border-[var(--system-purple)]/15 hover:bg-[var(--system-purple)]/20 transition-colors"
                                                >
                                                    {example}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="relative group">
                                            <label htmlFor="rule-input" className="sr-only">Rule description</label>
                                            <textarea
                                                id="rule-input"
                                                value={rule}
                                                maxLength={8000}
                                                disabled={isSubmitting}
                                                onChange={(e) => { setRule(e.target.value); setError(null); }}
                                                placeholder="Type your rule here..."
                                                className="tidy-textbox w-full text-foreground dark:text-foreground text-[14px] rounded-lg p-4 min-h-[120px] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)] placeholder:text-muted-foreground transition-all border border-black/5 dark:border-white/5"
                                                autoFocus
                                            />
                                            {/* Magical glow effect behind textarea when focused */}
                                            <div className="absolute inset-0 -z-10 rounded-lg bg-[var(--system-blue)] opacity-0 transition-opacity duration-300 group-focus-within:opacity-20 blur-xl" aria-hidden="true" />
                                        </div>
                                        {error && <p role="alert" className="tidy-rule-error">{error}</p>}
                                    </div>

                                    {/* Footer */}
                                    <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-black/5 dark:border-white/[0.08] bg-black/[0.02] dark:bg-black/10">
                                        <button
                                            onClick={onClose}
                                            disabled={isSubmitting}
                                            className="px-4 py-1.5 text-[14px] text-[var(--tidy-secondary-label)] dark:text-[var(--tidy-secondary-label)] hover:text-foreground hover:bg-black/5 dark:hover:text-foreground dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)]"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={async () => {
                                                setIsSubmitting(true);
                                                setError(null);
                                                try {
                                                    await onSave(rule);
                                                    setRule("");
                                                    onClose();
                                                } catch (e) {
                                                    setError(e instanceof Error ? e.message : "Couldn't prepare the rule. Please try again.");
                                                } finally {
                                                    setIsSubmitting(false);
                                                }
                                            }}
                                            disabled={!rule.trim() || isSubmitting}
                                            className="tidy-primary flex items-center gap-1.5 px-4 py-1.5 text-[14px] text-[var(--accent-text)] bg-[var(--system-blue)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-lg shadow-[var(--system-blue)]/20 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                        >
                                            {isSubmitting ? (
                                                <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" aria-hidden="true" />
                                            ) : (
                                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                            )}
                                            {isSubmitting ? "Working…" : "Review rule"}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </Dialog.Content>
                    </Dialog.Portal>
                )}
            </AnimatePresence>
        </Dialog.Root>
    );
}
