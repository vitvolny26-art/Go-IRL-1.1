import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { applyGoIrlLaunchContext, resolveGoIrlLaunchContext } from "../clientSurface";
import { CityPostersPage } from "./CityPostersPage";
import "../styles.css";
import "../responsive-shell.css";

applyGoIrlLaunchContext(document.documentElement, resolveGoIrlLaunchContext({
  telegram: window.Telegram,
  search: window.location.search,
  userAgent: navigator.userAgent,
}));
document.documentElement.classList.add("go-irl-city-posters");

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => { void navigator.serviceWorker.register("/service-worker.js").catch(() => undefined); });
}

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CityPostersPage />
    </QueryClientProvider>
  </StrictMode>,
);
