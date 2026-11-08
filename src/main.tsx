
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles/index.css";

import { ThemeProvider } from "next-themes";
import { AccessibilityProvider } from "./app/components/AccessibilityProvider";
import { ErrorBoundary } from "./app/components/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <AccessibilityProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </AccessibilityProvider>
  </ThemeProvider>
);
