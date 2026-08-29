import { useEffect, useState } from "react";
import { initializeTrustedAuth } from "../authSession";
import {
  firstOnboardingCompletedEvent,
  loadFirstOnboardingState,
} from "../onboarding/firstOnboarding";
import { useAppStore } from "../store";
import type { Language } from "../types";
import { CommunicationPreferencePanel } from "./CommunicationPreferencePanel";
import { communicationRouterEnabled } from "./feature";
import { loadCommunicationSettings } from "./repository";
import "./user-communication-preference-gate.css";

const dialogLabel: Record<Language, string> = {
  ru: "Канал для напоминаний, уведомлений и коммуникаций",
  uk: "Канал для нагадувань, сповіщень і комунікацій",
  cs: "Kanál pro připomínky, oznámení a komunikaci",
  en: "Channel for reminders, notifications, and communications",
};

export function UserCommunicationPreferenceGate() {
  const language = useAppStore((state) => state.language);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (!communicationRouterEnabled) {
        if (!cancelled) setOpen(false);
        return;
      }

      try {
        const identity = await initializeTrustedAuth();
        if (cancelled) return;
        if (!identity || (identity.source !== "trusted-telegram" && identity.source !== "trusted-provider")) {
          setOpen(false);
          return;
        }
        if (identity.user.role !== "user") {
          setOpen(false);
          return;
        }

        const onboarding = await loadFirstOnboardingState();
        if (cancelled) return;
        if (!onboarding.completed) {
          setOpen(false);
          return;
        }

        const settings = await loadCommunicationSettings();
        if (!cancelled) setOpen(settings.preference.state === "unconfigured");
      } catch {
        if (!cancelled) setOpen(false);
      }
    };

    const refreshAfterOnboarding = () => { void refresh(); };
    window.addEventListener(firstOnboardingCompletedEvent, refreshAfterOnboarding);
    void refresh();
    return () => {
      cancelled = true;
      window.removeEventListener(firstOnboardingCompletedEvent, refreshAfterOnboarding);
    };
  }, []);

  if (!open) return null;

  return (
    <div className="first-onboarding-backdrop" role="presentation">
      <div className="first-onboarding-card user-communication-preference-card" role="dialog" aria-modal="true" aria-label={dialogLabel[language]}>
        <CommunicationPreferencePanel
          language={language}
          audience="user"
          required
          onComplete={() => setOpen(false)}
        />
      </div>
    </div>
  );
}
