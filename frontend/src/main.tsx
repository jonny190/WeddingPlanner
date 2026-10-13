import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { isApiError } from "./api/client";
import App from "./App";
import { SessionProvider } from "./auth/session";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { ToastProvider } from "./components/Toasts";
import { NavigationGuardProvider } from "./layout/NavigationGuard";
// The app's own typefaces, served from this origin (no third-party font requests).
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Don't retry client errors (not found, forbidden, validation); do retry flaky network/5xx once.
      retry: (failureCount, error) => {
        if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
        return failureCount < 1;
      },
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <ConfirmProvider>
            <NavigationGuardProvider>
              <SessionProvider>
                <App />
              </SessionProvider>
            </NavigationGuardProvider>
          </ConfirmProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
