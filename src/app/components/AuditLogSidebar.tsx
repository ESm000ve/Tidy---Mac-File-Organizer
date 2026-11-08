import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { clsx } from 'clsx';

import { ClockFill as Clock, Copy, Rotate as Undo, X } from "./icons";
import { useEscapeKey } from "../hooks/useEscapeKey";
interface Operation {
  originalPath: string;
  newPath: string;
  originalName: string;
  newName: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  operations: Operation[];
  lastRunTime: Date | null;
  onUndo: (operations: Operation[]) => Promise<void | boolean>;
  isUndoing?: boolean;
}

export function AuditLogSidebar({ isOpen, onClose, operations, lastRunTime, onUndo, isUndoing }: Props) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  useEscapeKey(isOpen, onClose);

  // Focus trap — keeps keyboard focus within the panel while it is open
  useEffect(() => {
    if (!isOpen) return;
    const el = sidebarRef.current;
    if (!el) return;

    // Move focus to the first interactive element inside the panel
    const focusable = el.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    focusable[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const els = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40 backdrop-blur-[2px]"
          />

          {/* Sidebar */}
          <motion.div
            ref={sidebarRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-log-title"
            initial={{ x: "100%", opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.5 }}
            transition={{ duration: 0.2, ease: [0.1, 0.9, 0.2, 1] }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[400px] bg-card backdrop-blur-3xl backdrop-saturate-150 border-l-[0.5px] border-black/10 dark:border-white/10 shadow-2xl flex flex-col"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-black/5 dark:border-white/[0.08]">
              <div className="flex items-center gap-2 text-foreground dark:text-foreground">
                <Clock className="w-4 h-4 text-[var(--system-blue)]" aria-hidden="true" />
                <h2 id="audit-log-title" className="text-[14px] font-semibold">Activity Log</h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Close Activity Log"
                className="w-7 h-7 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/[0.08] dark:hover:bg-white/[0.12] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)]"
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {!operations || operations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Clock className="w-12 h-12 mb-3 text-[var(--tidy-secondary-label)]" />
                  <p className="text-[14px] font-medium">No recent activity</p>
                  <p className="text-[12px] mt-1">Organized files will appear here</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold text-muted-foreground/60">
                      Last Run · {lastRunTime ? lastRunTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown'}
                    </p>
                    <button
                      onClick={() => onUndo(operations)}
                      disabled={isUndoing}
                      aria-busy={isUndoing}
                      aria-label={isUndoing ? "Undoing last run, please wait" : "Undo last run"}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium text-[var(--system-red)] bg-[var(--system-red)]/10 hover:bg-[var(--system-red)]/20 rounded-md transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)]"
                    >
                      {isUndoing ? (
                         <div className="w-3 h-3 border border-[var(--system-red)]/30 border-t-[var(--system-red)] rounded-full animate-spin" aria-hidden="true" />
                      ) : (
                         <Undo className="w-3 h-3" aria-hidden="true" />
                      )}
                      <span aria-live="polite">{isUndoing ? "Undoing..." : "Undo Last Run"}</span>
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {operations.map((op, idx) => {
                      const isRenamed = op.originalName !== op.newName;
                      return (
                        <div key={idx} className="flex flex-col gap-1 p-3 rounded-lg bg-black/5 dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.05]">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                               {isRenamed ? (
                                  <div className="w-5 h-5 rounded-md bg-[var(--system-purple)]/15 flex items-center justify-center shrink-0" title="Renamed">
                                    <Copy className="w-3 h-3 text-[var(--system-purple)]" />
                                  </div>
                               ) : (
                                  <div className="w-5 h-5 rounded-md bg-[var(--system-blue)]/15 flex items-center justify-center shrink-0">
                                    <Clock className="w-3 h-3 text-[var(--system-blue)]" />
                                  </div>
                               )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-[14px] font-medium text-foreground dark:text-foreground truncate">
                                {op.newName}
                              </span>
                              <span className="text-[12px] text-muted-foreground truncate mt-0.5" title={op.originalPath}>
                                from {op.originalPath.split('/').slice(-2)[0] || 'Unknown'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function AuditLogToggleButton({ isOpen, onClick, isCompact }: { isOpen: boolean, onClick: () => void, isCompact?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label="Toggle Activity Log"
      aria-pressed={isOpen}
      title="Activity Log"
      className={isCompact 
        ? "w-7 h-7 flex items-center justify-center rounded-[4px] text-[var(--tidy-secondary-label)] dark:text-[var(--tidy-secondary-label)] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)]"
        : "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[14px] font-medium text-foreground dark:text-foreground hover:bg-black/5 dark:hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)]"}
    >
      <Clock className={clsx(isCompact ? "w-[14px] h-[14px]" : "w-3.5 h-3.5")} aria-hidden="true" />
      {!isCompact && <span>Activity Log</span>}
    </button>
  );
}
