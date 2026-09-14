import { CalendarClock, CheckCircle2, Clock3, UserRoundPlus } from "lucide-react";
import { buildMyGoIrlProjection } from "../profile/myGoIrlProjection";
import { useAppStore } from "../store";
import { getUserKey } from "../supabase";
import type { Language } from "../types";

const copy: Record<Language, { title: string; created: string; joined: string; pending: string; past: string }> = {
  ru: { title: "Сводка по жизненному циклу", created: "Созданные будущие", joined: "Предстоящие участия", pending: "Ожидают решения", past: "Прошедшие" },
  uk: { title: "Зведення життєвого циклу", created: "Створені майбутні", joined: "Майбутні участі", pending: "Очікують рішення", past: "Минулі" },
  cs: { title: "Přehled životního cyklu", created: "Budoucí vytvořené", joined: "Nadcházející účasti", pending: "Čekající žádosti", past: "Minulé" },
  en: { title: "Lifecycle summary", created: "Upcoming created", joined: "Upcoming joined", pending: "Pending requests", past: "Past" },
  pl: { title: "Lifecycle summary", created: "Upcoming created", joined: "Upcoming joined", pending: "Pending requests", past: "Past" },
  sk: { title: "Přehled životního cyklu", created: "Budoucí vytvořené", joined: "Nadcházející účasti", pending: "Čekající žádosti", past: "Minulé" },
};

export function MyGoIrlLifecycleSummary({ language }: { language: Language }) {
  const activities = useAppStore((state) => state.activities);
  const joinedIds = useAppStore((state) => state.joinedIds);
  const pendingIds = useAppStore((state) => state.pendingIds);
  const projection = buildMyGoIrlProjection(activities, getUserKey(), joinedIds, pendingIds);
  const labels = copy[language];
  const items = [
    { label: labels.created, value: projection.upcomingCreated.length, icon: <CalendarClock aria-hidden="true" /> },
    { label: labels.joined, value: projection.upcomingJoined.length, icon: <CheckCircle2 aria-hidden="true" /> },
    { label: labels.pending, value: projection.pendingRequests.length, icon: <UserRoundPlus aria-hidden="true" /> },
    { label: labels.past, value: projection.past.length, icon: <Clock3 aria-hidden="true" /> },
  ];

  return (
    <section className="profile-lifecycle-summary" aria-labelledby="profile-lifecycle-title">
      <h3 id="profile-lifecycle-title">{labels.title}</h3>
      <div className="life-grid profile-stats-grid">
        {items.map((item) => <div key={item.label} className="metric-card">{item.icon}<strong>{item.value}</strong><span>{item.label}</span></div>)}
      </div>
    </section>
  );
}
