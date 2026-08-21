import { useMemo } from "react";
import { CalendarDays, Sparkles } from "lucide-react";
import { buildMyGoIrlProjection } from "../profile/myGoIrlProjection";
import { readProfileVerticalPreferences, type ServicePreferenceId } from "../profile/profileVerticalPreferences";
import { buildProfileVerticalProjectionSummary } from "../profile/profileVerticalProjections";
import { useAppStore } from "../store";
import { getCurrentUserKey } from "../authSession";
import type { Language } from "../types";

type ProjectionCopy = {
  title: string;
  hint: string;
  activities: string;
  activitiesHint: string;
  created: string;
  joined: string;
  pending: string;
  past: string;
  services: string;
  servicesHint: string;
  noServices: string;
  serviceLabels: Record<ServicePreferenceId, string>;
};

const copy: Record<Language, ProjectionCopy> = {
  ru: {
    title: "Проекции профиля",
    hint: "Один профиль, разные данные по контексту.",
    activities: "Активности",
    activitiesHint: "Участие и события",
    created: "создано",
    joined: "участвую",
    pending: "заявки",
    past: "прошлые",
    services: "Услуги",
    servicesHint: "Предпочтения клиента",
    noServices: "Предпочтения услуг не выбраны",
    serviceLabels: {
      manicure: "Маникюр",
      hair: "Волосы",
      "brows-lashes": "Брови и ресницы",
      massage: "Массаж",
      facial: "Уход за лицом",
    },
  },
  uk: {
    title: "Проєкції профілю",
    hint: "Один профіль, різні дані за контекстом.",
    activities: "Активності",
    activitiesHint: "Участь і події",
    created: "створено",
    joined: "беру участь",
    pending: "заявки",
    past: "минулі",
    services: "Послуги",
    servicesHint: "Вподобання клієнта",
    noServices: "Вподобання послуг не вибрані",
    serviceLabels: {
      manicure: "Манікюр",
      hair: "Волосся",
      "brows-lashes": "Брови та вії",
      massage: "Масаж",
      facial: "Догляд за обличчям",
    },
  },
  cs: {
    title: "Projekce profilu",
    hint: "Jeden profil, různá data podle kontextu.",
    activities: "Aktivity",
    activitiesHint: "Účast a události",
    created: "vytvořeno",
    joined: "účastním se",
    pending: "žádosti",
    past: "minulé",
    services: "Služby",
    servicesHint: "Preference klienta",
    noServices: "Nejsou vybrány preference služeb",
    serviceLabels: {
      manicure: "Manikúra",
      hair: "Vlasy",
      "brows-lashes": "Obočí a řasy",
      massage: "Masáž",
      facial: "Péče o pleť",
    },
  },
  en: {
    title: "Profile projections",
    hint: "One profile, different context views.",
    activities: "Activities",
    activitiesHint: "Participation and events",
    created: "created",
    joined: "joined",
    pending: "requests",
    past: "past",
    services: "Services",
    servicesHint: "Client preferences",
    noServices: "No service preferences selected",
    serviceLabels: {
      manicure: "Manicure",
      hair: "Hair",
      "brows-lashes": "Brows & lashes",
      massage: "Massage",
      facial: "Facial care",
    },
  },
};

export function ProfileDesktopVerticalProjections({ language }: { language: Language }) {
  const activities = useAppStore((state) => state.activities);
  const joinedIds = useAppStore((state) => state.joinedIds);
  const pendingIds = useAppStore((state) => state.pendingIds);
  const userKey = getCurrentUserKey();
  const labels = copy[language];
  const projection = useMemo(() => buildProfileVerticalProjectionSummary(
    buildMyGoIrlProjection(activities, userKey, joinedIds, pendingIds),
    typeof window === "undefined" ? { services: [] } : readProfileVerticalPreferences(window.localStorage),
  ), [activities, joinedIds, pendingIds, userKey]);

  return (
    <aside className="profile-desktop-projections" aria-label={labels.title}>
      <header><strong>{labels.title}</strong><small>{labels.hint}</small></header>
      <section className="profile-projection-card" data-profile-projection="activities">
        <div className="profile-projection-heading"><CalendarDays /><span><strong>{labels.activities}</strong><small>{labels.activitiesHint}</small></span></div>
        <dl className="profile-projection-metrics">
          <div><dt>{labels.created}</dt><dd>{projection.activities.upcomingCreatedCount}</dd></div>
          <div><dt>{labels.joined}</dt><dd>{projection.activities.upcomingJoinedCount}</dd></div>
          <div><dt>{labels.pending}</dt><dd>{projection.activities.pendingRequestsCount}</dd></div>
          <div><dt>{labels.past}</dt><dd>{projection.activities.pastCount}</dd></div>
        </dl>
      </section>
      <section className="profile-projection-card" data-profile-projection="services">
        <div className="profile-projection-heading"><Sparkles /><span><strong>{labels.services}</strong><small>{labels.servicesHint}</small></span></div>
        {projection.services.preferenceIds.length ? (
          <div className="profile-projection-tags">
            {projection.services.preferenceIds.map((id) => <span key={id}>{labels.serviceLabels[id]}</span>)}
          </div>
        ) : <p className="profile-projection-empty">{labels.noServices}</p>}
      </section>
    </aside>
  );
}
