import * as AlertDialog from "@radix-ui/react-alert-dialog";

interface NoticeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
}

/**
 * A single-button modal for messages the user must acknowledge — a missing
 * folder, a failed run, a completed undo.
 *
 * `alertdialog` semantics are correct here: it interrupts, and dismissing it is
 * the only action available.
 */
export function NoticeDialog({ open, onOpenChange, message }: NoticeDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          className="tidy-notice fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2 w-full max-w-sm rounded-lg bg-background/80 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-2xl p-6 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <AlertDialog.Title className="text-[15px] font-semibold text-foreground dark:text-white mb-2">
            Notice
          </AlertDialog.Title>
          <AlertDialog.Description className="text-[14px] text-[var(--tidy-secondary-label)] dark:text-foreground mb-6 leading-relaxed">
            {message}
          </AlertDialog.Description>
          <AlertDialog.Action asChild>
            <button className="tidy-primary h-9 flex items-center justify-center rounded-[8px] bg-[var(--system-blue)] text-[var(--accent-text)] text-[14px] font-semibold hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-background">
              OK
            </button>
          </AlertDialog.Action>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
