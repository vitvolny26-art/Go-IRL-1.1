import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bell, CircleUserRound, KeyRound, LockKeyhole, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { AccountSecuritySection } from "./AccountSecuritySection";
import { ProfileLayout } from "./ProfileLayout";
import { ProfileInterestsGoalsSection } from "./ProfileInterestsGoalsSection";
import { ProfileDesktopVerticalProjections } from "./ProfileDesktopVerticalProjections";
import { MyGoIrlLifecycleSummary } from "./MyGoIrlLifecycleSummary";
import { OwnedProfilePrivacySection } from "./OwnedProfilePrivacySection";
import {
  defaultProfilePanelSection,
  profilePanelSections,
  transitionProfilePanel,
} from "../profile/profilePanelNavigation";
import {
  isProfilePath,
  profilePathForSection,
  resolveProfileSectionFromPath,
} from "../profile/profileRoute";
import { useBeautyWorkspaceAttentionCount } from "../beauty/beautyWorkspaceAttention";
import { canShowBeautyWorkspaceEntry } from "../beauty/servicesRoleNavigation";
import { useAppStore } from "../store";
import type { ProfilePanelSection, ProfilePanelState } from "../profile/profilePanelTypes";
import type { Language, UserRole } from "../types";

type ProfilePanelCopy = {
  title: string;
  hint: string;
  editing: string;
  beautyHint: string;
  sections: Record<ProfilePanelSection, { label: string; hint: string }>;
};

const copy: Record<Language, ProfilePanelCopy> = {
  ru: {
    title: "Мой профиль",
    hint: "Управляйте личностью, приложениями по умолчанию и своей активностью GO IRL.",
    editing: "Сначала завершите редактирование профиля",
    beautyHint: "Запросы, записи, расписание и страница мастера",
    sections: {
      identity: { label: "Личность", hint: "Имя, фото, город и интересы" },
      preferences: { label: "Предпочтения", hint: "Карты, календарь, отправка и напоминания" },
      "my-go-irl": { label: "Мой GO IRL", hint: "Будущие, созданные, заявки и прошлые события" },
      privacy: { label: "Приватность", hint: "Видимость, публичный предпросмотр и права" },
      security: { label: "Аккаунт и безопасность", hint: "Связанные способы входа и защита аккаунта" },
      diagnostics: { label: "Диагностика", hint: "Состояние синхронизации и выход в Telegram" },
    },
  },
  uk: {
    title: "Мій профіль",
    hint: "Керуйте особистістю, типовими застосунками та своєю активністю GO IRL.",
    editing: "Спочатку завершіть редагування профілю",
    beautyHint: "Запити, записи, розклад і сторінка майстра",
    sections: {
      identity: { label: "Особистість", hint: "Ім’я, фото, місто та інтереси" },
      preferences: { label: "Налаштування", hint: "Карти, календар, поширення та нагадування" },
      "my-go-irl": { label: "Мій GO IRL", hint: "Майбутні, створені, заявки та минулі події" },
      privacy: { label: "Приватність", hint: "Видимість, публічний перегляд і права" },
      security: { label: "Акаунт і безпека", hint: "Пов’язані способи входу та захист акаунта" },
      diagnostics: { label: "Діагностика", hint: "Стан синхронізації та повернення до Telegramу" },
    },
  },
  cs: {
    title: "Můj profil",
    hint: "Spravujte identitu, výchozí aplikace a svou aktivitu v GO IRL.",
    editing: "Nejprve dokončete úpravu profilu",
    beautyHint: "Žádosti, rezervace, rozvrh a stránka profesionála",
    sections: {
      identity: { label: "Identita", hint: "Jméno, fotografie, město a zájmy" },
      preferences: { label: "Předvolby", hint: "Mapy, kalendář, sdílení a připomínky" },
      "my-go-irl": { label: "Moje GO IRL", hint: "Budoucí, vytvořené, žádosti a minulé události" },
      privacy: { label: "Soukromí", hint: "Viditelnost, veřejný náhled a práva" },
      security: { label: "Účet a zabezpečení", hint: "Propojené způsoby přihlášení a ochrana účtu" },
      diagnostics: { label: "Diagnostika", hint: "Stav synchronizace a návrat do Telegramu" },
    },
  },
  en: {
    title: "My profile",
    hint: "Manage identity, default apps and your GO IRL activity.",
    editing: "Finish editing your profile first",
    beautyHint: "Requests, bookings, schedule and professional page",
    sections: {
      identity: { label: "Identity", hint: "Name, photo, city and interests" },
      preferences: { label: "Preferences", hint: "Maps, calendar, sharing and reminders" },
      "my-go-irl": { label: "My GO IRL", hint: "Upcoming, created, requests and past events" },
      privacy: { label: "Privacy", hint: "Visibility, public preview and rights" },
      security: { label: "Account & Security", hint: "Linked sign-in methods and account protection" },
      diagnostics: { label: "Diagnostics", hint: "Sync state and return to Telegram" },
    },
  },
};

const icons: Record<ProfilePanelSection, ReactNode> = {
  identity: <CircleUserRound />,
  preferences: <Settings2 />,
  "my-go-irl": <Bell />,
  privacy: <LockKeyhole />,
  security: <KeyRound />,
  diagnostics: <ShieldCheck />,
};

type ProfilePanelProps = {
  language: Language;
  editing: boolean;
  renderSection: (section: ProfilePanelSection) => ReactNode;
  onSectionChange?: (section: ProfilePanelSection) => void;
  userRole?: UserRole;
};

export function ProfilePanel({ language, editing, renderSection, onSectionChange, userRole: userRoleOverride }: ProfilePanelProps) {
  const [activeSection, setActiveSection] = useState<ProfilePanelSection>(() => (
    typeof window === "undefined" ? defaultProfilePanelSection : resolveProfileSectionFromPath(window.location.pathname)
  ));
  const storedUserRole = useAppStore((state) => state.userRole);
  const userRole = userRoleOverride ?? storedUserRole;
  const attentionCount = useBeautyWorkspaceAttentionCount();
  const labels = copy[language];
  const applySection = useCallback((section: ProfilePanelSection) => {
    setActiveSection(section);
    onSectionChange?.(section);
  }, [onSectionChange]);

  useEffect(() => {
    if (editing && activeSection !== defaultProfilePanelSection) {
      if (isProfilePath(window.location.pathname)) {
        window.history.replaceState({}, "", profilePathForSection(defaultProfilePanelSection));
      }
      applySection(defaultProfilePanelSection);
    }
  }, [activeSection, applySection, editing]);

  const selectSection = (requested: ProfilePanelSection) => {
    const current: ProfilePanelState = { activeSection, editing };
    const next = transitionProfilePanel(current, requested);
    if (next.activeSection === activeSection) return;
    if (isProfilePath(window.location.pathname)) {
      window.history.pushState({}, "", profilePathForSection(next.activeSection));
    }
    applySection(next.activeSection);
  };

  const baseContent = activeSection === "privacy" || activeSection === "security" ? null : renderSection(activeSection);
  const sectionContent = activeSection === "identity"
    ? <>{baseContent}<ProfileInterestsGoalsSection language={language} /></>
    : activeSection === "my-go-irl"
      ? <><MyGoIrlLifecycleSummary language={language} />{baseContent}</>
      : activeSection === "privacy"
        ? <OwnedProfilePrivacySection language={language} />
        : activeSection === "security"
          ? <AccountSecuritySection language={language} />
          : baseContent;
  const content = <div className="profile-panel-content" data-profile-panel-content={activeSection}>{sectionContent}</div>;

  return (
    <ProfileLayout activeSection={activeSection} editing={editing} onSectionChange={applySection}>
      <div className="profile-panel" data-profile-panel-section={activeSection}>
        <header className="profile-panel-header"><h2>{labels.title}</h2><p>{labels.hint}</p></header>
        {canShowBeautyWorkspaceEntry(userRole) && (
          <a className="profile-panel-beauty-entry" href="/beauty/workspace" target="_blank" rel="noopener noreferrer">
            <Sparkles />
            <span><strong>GO IRL Beauty</strong><small>{labels.beautyHint}</small></span>
            {attentionCount > 0 && <b className="profile-panel-beauty-badge" aria-label={`${attentionCount}`}>{attentionCount > 99 ? "99+" : attentionCount}</b>}
          </a>
        )}
        <div className="profile-panel-shell">
          <div className="profile-panel-primary">
            {activeSection === defaultProfilePanelSection ? content : null}
            <nav className="profile-panel-navigation" aria-label={labels.title}>
              {profilePanelSections.map(({ id }) => {
                const blocked = editing && id !== defaultProfilePanelSection;
                return (
                  <button key={id} className={activeSection === id ? "profile-panel-card is-active" : "profile-panel-card"} type="button" aria-current={activeSection === id ? "page" : undefined} disabled={blocked} title={blocked ? labels.editing : undefined} onClick={() => selectSection(id)}>
                    <span className="profile-panel-card-icon">{icons[id]}</span>
                    <span><strong>{labels.sections[id].label}</strong><small>{labels.sections[id].hint}</small></span>
                  </button>
                );
              })}
            </nav>
            {activeSection !== defaultProfilePanelSection ? content : null}
          </div>
          <ProfileDesktopVerticalProjections language={language} />
        </div>
      </div>
    </ProfileLayout>
  );
}
