import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-[var(--tidy-window-background)] text-foreground" style={{ fontFamily: "var(--font-ui)" }}>
          <div className="max-w-md rounded-[14px] bg-background/80 p-8 shadow-2xl backdrop-blur-xl border border-black/10 dark:border-white/10 text-center">
            <h1 className="mb-4 text-xl font-semibold text-foreground">Something went wrong</h1>
            <p className="mb-6 text-sm text-[var(--tidy-secondary-label)]">
              The application encountered an unexpected error.
            </p>
            <div className="mb-6 rounded-lg bg-black/5 dark:bg-white/5 p-4 text-left text-xs text-[var(--tidy-secondary-label)] overflow-auto max-h-32">
              <code>{this.state.error?.message}</code>
            </div>
            <button
              className="h-8 rounded-[8px] bg-[var(--system-blue)] px-6 text-[14px] font-semibold text-[var(--accent-text)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tidy-focus-ring)]"
              onClick={() => window.location.reload()}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
