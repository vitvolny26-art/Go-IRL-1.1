import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getCurrentUserRole, initializeTrustedAuth } from "../authSession";
import { applyGoIrlLaunchContext, resolveGoIrlLaunchContext } from "../clientSurface";
import { DevPanel, shouldShowAdminDevPanel } from "../components/DevPanel";
import { CityPostersPage } from "./CityPostersPage";
import "../styles.css";
import "../responsive-shell.css";
import "./sport-visual-fixture.css";

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

function CityPostersAdminDevPanel() {
  const [userRole, setUserRole] = useState(getCurrentUserRole);

  useEffect(() => {
    let active = true;
    void initializeTrustedAuth().then(
      () => { if (active) setUserRole(getCurrentUserRole()); },
      () => { if (active) setUserRole(getCurrentUserRole()); },
    );
    return () => { active = false; };
  }, []);

  return shouldShowAdminDevPanel(userRole) ? <DevPanel /> : null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CityPostersPage />
      <CityPostersAdminDevPanel />
    </QueryClientProvider>
  </StrictMode>,
);
