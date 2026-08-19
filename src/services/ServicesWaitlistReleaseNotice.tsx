import { useCallback, useEffect, useState } from "react";
import type { Language } from "../types";
import {
  loadMyServiceWaitlist,
  type ServiceWaitlistEntry,
} from "./servicesBookingWaitlistRepository";

const copy = {
  ru: {
    title: "Слот освободился",
    body: "Место не зарезервировано — запись получит тот, кто оформит её первым.",
  },
  uk: {
    title: "Слот звільнився",
    body: "Місце не зарезервоване — запис отримає той, хто оформить його першим.",
  },
  cs: {
    title: "Termín se uvolnil",
    body: "Termín není rezervovaný — získá ho ten, kdo rezervaci dokončí jako první.",
  },
  en: {
    title: "Slot available",
    body: "The slot is not reserved — it goes to whoever completes the booking first.",
  },
} satisfies Record<Language, { title: string; body: string }>;

const releasedEntries = (entries: ServiceWaitlistEntry[]) => entries.filter((entry) =>
  entry.status === "active"
  && Boolean(entry.lastNotifiedAt)
  && new Date(entry.slotStart).getTime() > Date.now(),
);

export function ServicesWaitlistReleaseNotice({ language }: { language: Language }) {
  const text = copy[language];
  const [entries, setEntries] = useState<ServiceWaitlistEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await loadMyServiceWaitlist(language);
      setEntries(snapshot.source === "server" ? releasedEntries(snapshot.entries) : []);
    } catch {
      setEntries([]);
    }
  }, [language]);

  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  if (entries.length === 0) return null;

  return (
    <section className="services-bookings-list" role="status" aria-live="polite" data-services-waitlist-release-notice>
      {entries.map((entry) => (
        <article className="services-booking-card status-confirmed" key={entry.id}>
          <header>
            <span><strong>{text.title}</strong><small>{text.body}</small></span>
            <b>{entry.serviceName}</b>
          </header>
          <div className="services-booking-meta">
            <div><span><small>{entry.date}</small><strong>{entry.time}</strong></span></div>
            <div><span><small>{entry.publicLocation}</small><strong>{text.body}</strong></span></div>
          </div>
        </article>
      ))}
    </section>
  );
}
