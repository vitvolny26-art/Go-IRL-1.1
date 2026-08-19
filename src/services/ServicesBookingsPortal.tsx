import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "../store";
import { ServicesBookingsView } from "./ServicesBookingsView";
import { ServicesWaitlistReleaseNotice } from "./ServicesWaitlistReleaseNotice";

const isServicesPath = () => window.location.pathname.replace(/\/+$/, "") === "/services";

export function ServicesBookingsPortal() {
  const language = useAppStore((state) => state.language);
  const view = useAppStore((state) => state.view);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const active = typeof window !== "undefined" && isServicesPath() && view === "bookings";

  useEffect(() => {
    if (!active) {
      setTarget(null);
      return undefined;
    }
    const resolve = () => setTarget(document.querySelector<HTMLElement>(".app > main"));
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    if (!active || !target) return undefined;
    target.classList.add("services-bookings-portal-active");
    return () => target.classList.remove("services-bookings-portal-active");
  }, [active, target]);

  if (!active || !target) return null;
  return createPortal(
    <div data-services-bookings-portal>
      <ServicesWaitlistReleaseNotice language={language} />
      <ServicesBookingsView language={language} />
    </div>,
    target,
  );
}
