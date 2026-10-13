import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { applyTheme, watchSystemTheme } from "./lib/theme";
import { RequestError } from "./lib/api";
import "./index.css";

applyTheme();
watchSystemTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof RequestError && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
