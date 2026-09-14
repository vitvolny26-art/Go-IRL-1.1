import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { isBrowserMockMode } from "../authSession";
import { loadProfessionalDirectory } from "../services/servicesProfessionalDirectory";
import { useAppStore } from "../store";
import {
  canReadBeautyShareCardStatus,
  loadBeautyShareCardStatus,
  type BeautyShareCardStatus,
} from "./beautyShareCardStatus";
import {
  beautyShareCardStaffStatusCopy,
  formatBeautyShareCardStaffStatus,
} from "./beautyShareCardStatusView";
import "./beauty-share-card-staff-status.css";

const label = {
  ru: "Статус визитки",
  uk: "Статус візитки",
  cs: "Stav vizitky",
  en: "Business-card status",
  pl: "Business-card status",
  sk: "Stav vizitky",
};

export function BeautyShareCardStaffStatusPortal() {
  const language = useAppStore((state) => state.language);
  const selectedCityId = useAppStore((state) => state.selectedCityId);
  const userRole = useAppStore((state) => state.userRole);
  const [slug, setSlug] = useState("");
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [status, setStatus] = useState<BeautyShareCardStatus | null>(null);
  const allowed = !isBrowserMockMode() && canReadBeautyShareCardStatus(userRole);

  useEffect(() => {
    if (!allowed) return;
    const captureProfile = (event: PointerEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-beauty-slug] .services-professional-main")
        : null;
      const wrapper = target?.closest<HTMLElement>("[data-beauty-slug]");
      if (wrapper?.dataset.beautySlug) setSlug(wrapper.dataset.beautySlug);
    };
    document.addEventListener("pointerdown", captureProfile, true);
    return () => document.removeEventListener("pointerdown", captureProfile, true);
  }, [allowed]);

  useEffect(() => {
    if (!allowed || !slug) return;
    const mountId = "beauty-share-card-staff-status-mount";
    const syncMount = () => {
      const shell = document.querySelector<HTMLElement>(".beauty-pro-profile-shell:not(.beauty-pro-profile-state)");
      const actions = shell?.querySelector<HTMLElement>(".beauty-pro-profile-primary-actions");
      if (!shell || !actions) {
        setMount(null);
        return;
      }
      let target = shell.querySelector<HTMLElement>(`#${mountId}`);
      if (!target) {
        target = document.createElement("div");
        target.id = mountId;
        actions.insertAdjacentElement("afterend", target);
      }
      setMount(target);
    };
    syncMount();
    const observer = new MutationObserver(syncMount);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.getElementById(mountId)?.remove();
      setMount(null);
    };
  }, [allowed, slug]);

  useEffect(() => {
    if (!allowed || !slug) {
      setPhase("idle");
      setStatus(null);
      return;
    }
    let active = true;
    setPhase("loading");
    setStatus(null);
    void loadProfessionalDirectory(selectedCityId, language)
      .then((professionals) => professionals.find((item) => item.slug === slug)?.profileId || "")
      .then((profileId) => profileId
        ? loadBeautyShareCardStatus(profileId, { role: userRole, browserMock: false })
        : null)
      .then((nextStatus) => {
        if (!active) return;
        setStatus(nextStatus);
        setPhase("ready");
      })
      .catch(() => {
        if (!active) return;
        setStatus(null);
        setPhase("error");
      });
    return () => { active = false; };
  }, [allowed, language, selectedCityId, slug, userRole]);

  if (!allowed || !mount || phase === "idle" || (phase === "ready" && !status)) return null;
  const message = phase === "loading"
    ? beautyShareCardStaffStatusCopy(language, "loading")
    : phase === "error" || !status
      ? beautyShareCardStaffStatusCopy(language, "unavailable")
      : formatBeautyShareCardStaffStatus(status, language);
  const statusClass = status?.status || phase;

  return createPortal(
    <section className={`beauty-share-card-staff-status is-${statusClass}`} role="status" aria-live="polite">
      <small>{label[language]}</small>
      <strong>{message}</strong>
    </section>,
    mount,
  );
}
