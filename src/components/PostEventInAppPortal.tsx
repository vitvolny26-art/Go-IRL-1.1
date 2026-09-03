import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Check, Star, UsersRound, X } from "lucide-react";
import { getStoredUiLanguage, type UiLanguage } from "../i18n";
import { resolvePostEventEntryIntent, type PostEventEntryIntent } from "../postEventEntry";
import {
  finalizeOrganizerPostEventAttendance,
  isPostEventIntentActionable,
  loadInAppPostEventIntents,
  loadOrganizerPostEventState,
  loadParticipantPostEventState,
  organizerPostEventComplete,
  participantPostEventComplete,
  recordOrganizerPostEventOutcome,
  submitParticipantPostEventAttendance,
  submitPostEventOrganizerRating,
  toggleOrganizerPostEventAbsence,
  type InAppPostEventIntent,
  type OrganizerPostEventRow,
  type ParticipantPostEventState,
} from "../postEventState";
import { useAppStore } from "../store";
import "../post-event-in-app.css";

type Copy = {
  bannerTitle: string;
  bannerBody: string;
  answer: string;
  close: string;
  organizerTitle: string;
  participantTitle: string;
  happened: string;
  didNotHappen: string;
  problem: string;
  roster: string;
  attended: string;
  absent: string;
  finalize: string;
  participantAttended: string;
  participantAbsent: string;
  participantEventMissing: string;
  ratingTitle: string;
  saveRating: string;
  saved: string;
  completed: string;
  loading: string;
  unavailable: string;
  retry: string;
  tagsTitle: string;
};

const copyByLanguage: Record<UiLanguage, Copy> = {
  ru: { bannerTitle: "Опрос после события", bannerBody: "Подтвердите, как прошло событие.", answer: "Ответить", close: "Закрыть", organizerTitle: "Состоялось ли событие?", participantTitle: "Вы были на событии?", happened: "Да, состоялось", didNotHappen: "Нет, не состоялось", problem: "Возникла проблема", roster: "Отметьте тех, кто не пришёл", attended: "Был", absent: "Не был", finalize: "Готово", participantAttended: "Да, был(а)", participantAbsent: "Нет, не был(а)", participantEventMissing: "Событие не состоялось", ratingTitle: "Оцените организатора", saveRating: "Сохранить оценку", saved: "Ответ сохранён", completed: "Опрос завершён", loading: "Загрузка…", unavailable: "Не удалось открыть опрос", retry: "Повторить", tagsTitle: "Что отметить?" },
  uk: { bannerTitle: "Опитування після події", bannerBody: "Підтвердьте, як пройшла подія.", answer: "Відповісти", close: "Закрити", organizerTitle: "Подія відбулася?", participantTitle: "Ви були на події?", happened: "Так, відбулася", didNotHappen: "Ні, не відбулася", problem: "Виникла проблема", roster: "Позначте тих, хто не прийшов", attended: "Був", absent: "Не був", finalize: "Готово", participantAttended: "Так, був(ла)", participantAbsent: "Ні, не був(ла)", participantEventMissing: "Подія не відбулася", ratingTitle: "Оцініть організатора", saveRating: "Зберегти оцінку", saved: "Відповідь збережено", completed: "Опитування завершено", loading: "Завантаження…", unavailable: "Не вдалося відкрити опитування", retry: "Повторити", tagsTitle: "Що відзначити?" },
  cs: { bannerTitle: "Průzkum po události", bannerBody: "Potvrďte, jak událost proběhla.", answer: "Odpovědět", close: "Zavřít", organizerTitle: "Proběhla událost?", participantTitle: "Byli jste na události?", happened: "Ano, proběhla", didNotHappen: "Ne, neproběhla", problem: "Nastal problém", roster: "Označte ty, kteří nepřišli", attended: "Byl/a", absent: "Nebyl/a", finalize: "Hotovo", participantAttended: "Ano, byl/a jsem", participantAbsent: "Ne, nebyl/a jsem", participantEventMissing: "Událost se nekonala", ratingTitle: "Ohodnoťte organizátora", saveRating: "Uložit hodnocení", saved: "Odpověď uložena", completed: "Průzkum dokončen", loading: "Načítání…", unavailable: "Průzkum nelze otevřít", retry: "Zkusit znovu", tagsTitle: "Co chcete ocenit?" },
  en: { bannerTitle: "Post-event check-in", bannerBody: "Confirm what happened at the event.", answer: "Answer", close: "Close", organizerTitle: "Did the event happen?", participantTitle: "Did you attend the event?", happened: "Yes, it happened", didNotHappen: "No, it did not happen", problem: "There was a problem", roster: "Mark people who did not attend", attended: "Attended", absent: "Absent", finalize: "Done", participantAttended: "Yes, I attended", participantAbsent: "No, I did not attend", participantEventMissing: "The event did not happen", ratingTitle: "Rate the organizer", saveRating: "Save rating", saved: "Response saved", completed: "Check-in complete", loading: "Loading…", unavailable: "Could not open the check-in", retry: "Retry", tagsTitle: "What stood out?" },
  pl: { bannerTitle: "Ankieta po wydarzeniu", bannerBody: "Potwierdź, jak przebiegło wydarzenie.", answer: "Odpowiedz", close: "Zamknij", organizerTitle: "Czy wydarzenie się odbyło?", participantTitle: "Czy byłeś(-aś) na wydarzeniu?", happened: "Tak, odbyło się", didNotHappen: "Nie, nie odbyło się", problem: "Wystąpił problem", roster: "Oznacz osoby, które nie przyszły", attended: "Był(a)", absent: "Nie był(a)", finalize: "Gotowe", participantAttended: "Tak, byłem(-am)", participantAbsent: "Nie, nie byłem(-am)", participantEventMissing: "Wydarzenie się nie odbyło", ratingTitle: "Oceń organizatora", saveRating: "Zapisz ocenę", saved: "Odpowiedź zapisana", completed: "Ankieta zakończona", loading: "Ładowanie…", unavailable: "Nie można otworzyć ankiety", retry: "Spróbuj ponownie", tagsTitle: "Co wyróżnić?" },
  sk: { bannerTitle: "Prieskum po udalosti", bannerBody: "Potvrďte, ako udalosť prebehla.", answer: "Odpovedať", close: "Zavrieť", organizerTitle: "Udalosť sa uskutočnila?", participantTitle: "Boli ste na udalosti?", happened: "Áno, uskutočnila sa", didNotHappen: "Nie, neuskutočnila sa", problem: "Nastal problém", roster: "Označte tých, ktorí neprišli", attended: "Bol/a", absent: "Nebol/a", finalize: "Hotovo", participantAttended: "Áno, bol/a som", participantAbsent: "Nie, nebol/a som", participantEventMissing: "Udalosť sa neuskutočnila", ratingTitle: "Ohodnoťte organizátora", saveRating: "Uložiť hodnotenie", saved: "Odpoveď uložená", completed: "Prieskum dokončený", loading: "Načítava sa…", unavailable: "Prieskum sa nedá otvoriť", retry: "Skúsiť znova", tagsTitle: "Čo chcete vyzdvihnúť?" },
};

const ratingTags = ["organization", "communication", "punctuality", "safety", "other"] as const;
const tagLabels: Record<UiLanguage, Record<(typeof ratingTags)[number], string>> = {
  ru: { organization: "Организация", communication: "Коммуникация", punctuality: "Пунктуальность", safety: "Безопасность", other: "Другое" },
  uk: { organization: "Організація", communication: "Комунікація", punctuality: "Пунктуальність", safety: "Безпека", other: "Інше" },
  cs: { organization: "Organizace", communication: "Komunikace", punctuality: "Dochvilnost", safety: "Bezpečnost", other: "Jiné" },
  en: { organization: "Organization", communication: "Communication", punctuality: "Punctuality", safety: "Safety", other: "Other" },
  pl: { organization: "Organizacja", communication: "Komunikacja", punctuality: "Punktualność", safety: "Bezpieczeństwo", other: "Inne" },
  sk: { organization: "Organizácia", communication: "Komunikácia", punctuality: "Dochvíľnosť", safety: "Bezpečnosť", other: "Iné" },
};

const currentCopy = () => copyByLanguage[getStoredUiLanguage(useAppStore.getState().language)];

const formatFailure = (error: unknown, copy: Copy) => {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("participant confirmation not open yet")) return copy.unavailable;
  return copy.unavailable;
};

type PanelProps = {
  intent: PostEventEntryIntent;
  title?: string;
  onClose: () => void;
  onResolved: (complete: boolean) => void;
};

function PostEventActionPanel({ intent, title, onClose, onResolved }: PanelProps) {
  const language = getStoredUiLanguage(useAppStore((state) => state.language));
  const copy = copyByLanguage[language];
  const participantMode = Boolean(intent.feedbackId);
  const [organizerRows, setOrganizerRows] = useState<OrganizerPostEventRow[]>([]);
  const [participantState, setParticipantState] = useState<ParticipantPostEventState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (intent.feedbackId) {
        const next = await loadParticipantPostEventState(intent.feedbackId);
        setParticipantState(next);
        if (next?.organizerRating) setRating(next.organizerRating);
        setTags(next?.ratingTags || []);
        onResolved(participantPostEventComplete(next));
      } else {
        const next = await loadOrganizerPostEventState(intent.activityId);
        setOrganizerRows(next);
        onResolved(organizerPostEventComplete(next));
      }
    } catch (nextError) {
      setError(formatFailure(nextError, copy));
    } finally {
      setLoading(false);
    }
  }, [copy, intent.activityId, intent.feedbackId, onResolved]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await operation();
      setSaved(copy.saved);
      await refresh();
    } catch (nextError) {
      setError(formatFailure(nextError, copy));
    } finally {
      setBusy(false);
    }
  };

  const organizerOutcome = organizerRows[0];
  const organizerComplete = organizerPostEventComplete(organizerRows);
  const participantComplete = participantPostEventComplete(participantState);
  const resolvedAttended = participantState?.attendanceResolution === "attended";

  return (
    <div className="post-event-overlay" role="presentation" onMouseDown={onClose}>
      <section className="post-event-panel" role="dialog" aria-modal="true" aria-label={participantMode ? copy.participantTitle : copy.organizerTitle} onMouseDown={(event) => event.stopPropagation()}>
        <button className="post-event-close" onClick={onClose} type="button" aria-label={copy.close}><X /></button>
        <div className="post-event-kicker">GO IRL · POSTEVENT</div>
        <h2>{participantMode ? copy.participantTitle : copy.organizerTitle}</h2>
        {title ? <p className="post-event-title">{title}</p> : null}

        {loading ? <div className="post-event-status">{copy.loading}</div> : null}
        {error ? <div className="post-event-error"><span>{error}</span><button type="button" onClick={() => void refresh()}>{copy.retry}</button></div> : null}
        {saved ? <div className="post-event-saved"><Check />{saved}</div> : null}

        {!loading && !error && !participantMode && !organizerComplete && !organizerOutcome?.organizerEventClaim ? (
          <div className="post-event-choice-grid">
            <button type="button" disabled={busy} onClick={() => void run(() => recordOrganizerPostEventOutcome(intent.activityId, "happened"))}>{copy.happened}</button>
            <button type="button" disabled={busy} onClick={() => void run(() => recordOrganizerPostEventOutcome(intent.activityId, "did_not_happen"))}>{copy.didNotHappen}</button>
            <button className="secondary" type="button" disabled={busy} onClick={() => void run(() => recordOrganizerPostEventOutcome(intent.activityId, "problem"))}>{copy.problem}</button>
          </div>
        ) : null}

        {!loading && !error && !participantMode && organizerOutcome?.organizerEventClaim === "happened" && !organizerComplete ? (
          <>
            <div className="post-event-section-title"><UsersRound />{copy.roster}</div>
            <div className="post-event-roster">
              {organizerRows.map((row) => (
                <button
                  key={row.feedbackId}
                  className={row.organizerDraftAbsent ? "post-event-roster-row is-absent" : "post-event-roster-row"}
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => toggleOrganizerPostEventAbsence(row.feedbackId, !row.organizerDraftAbsent))}
                >
                  <span>{row.participantDisplayName}</span>
                  <strong>{row.organizerDraftAbsent ? copy.absent : copy.attended}</strong>
                </button>
              ))}
            </div>
            <button className="post-event-primary" type="button" disabled={busy} onClick={() => void run(() => finalizeOrganizerPostEventAttendance(intent.activityId))}>{copy.finalize}</button>
          </>
        ) : null}

        {!loading && !error && !participantMode && organizerOutcome?.organizerEventClaim && organizerOutcome.organizerEventClaim !== "happened" ? (
          <div className="post-event-complete"><Check />{copy.saved}</div>
        ) : null}

        {!loading && !error && !participantMode && organizerComplete ? (
          <div className="post-event-complete"><Check />{copy.completed}</div>
        ) : null}

        {!loading && !error && participantMode && participantState && !participantState.participantClaim ? (
          <div className="post-event-choice-grid">
            <button type="button" disabled={busy} onClick={() => void run(() => submitParticipantPostEventAttendance(intent.feedbackId!, "attended"))}>{copy.participantAttended}</button>
            <button type="button" disabled={busy} onClick={() => void run(() => submitParticipantPostEventAttendance(intent.feedbackId!, "absent"))}>{copy.participantAbsent}</button>
            <button className="secondary" type="button" disabled={busy} onClick={() => void run(() => submitParticipantPostEventAttendance(intent.feedbackId!, "event_did_not_happen"))}>{copy.participantEventMissing}</button>
          </div>
        ) : null}

        {!loading && !error && participantMode && participantState?.participantClaim ? (
          <div className="post-event-complete"><Check />{copy.saved}</div>
        ) : null}

        {!loading && !error && participantMode && resolvedAttended ? (
          <div className="post-event-rating">
            <div className="post-event-section-title"><Star />{copy.ratingTitle}</div>
            <div className="post-event-stars" aria-label={copy.ratingTitle}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} className={rating >= value ? "is-selected" : ""} type="button" disabled={busy} onClick={() => setRating(value)} aria-label={`${value}/5`}><Star /></button>
              ))}
            </div>
            <div className="post-event-tags-title">{copy.tagsTitle}</div>
            <div className="post-event-tags">
              {ratingTags.map((tag) => (
                <label key={tag}><input type="checkbox" checked={tags.includes(tag)} disabled={busy} onChange={() => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} /><span>{tagLabels[language][tag]}</span></label>
              ))}
            </div>
            <button className="post-event-primary" type="button" disabled={busy || rating < 1} onClick={() => void run(() => submitPostEventOrganizerRating(intent.feedbackId!, rating, tags))}>{copy.saveRating}</button>
          </div>
        ) : null}

        {!loading && !error && participantMode && participantComplete ? (
          <div className="post-event-complete final"><Check />{copy.completed}</div>
        ) : null}
      </section>
    </div>
  );
}

const readExplicitIntent = () => resolvePostEventEntryIntent(window.location);
const supportedSurface = () => {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path === "" || path === "/activities" || path === "/join" || path.startsWith("/join/");
};

function PostEventInAppPortal() {
  const language = getStoredUiLanguage(useAppStore((state) => state.language));
  const loading = useAppStore((state) => state.loading);
  const copy = copyByLanguage[language];
  const [explicitIntent, setExplicitIntent] = useState<PostEventEntryIntent | null>(readExplicitIntent);
  const [prompt, setPrompt] = useState<InAppPostEventIntent | null>(null);
  const [activeIntent, setActiveIntent] = useState<PostEventEntryIntent | null>(() => readExplicitIntent());
  const [activeTitle, setActiveTitle] = useState<string | undefined>();
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() => new Set());
  const [refreshSequence, setRefreshSequence] = useState(0);

  useEffect(() => {
    const sync = () => {
      const next = readExplicitIntent();
      setExplicitIntent(next);
      if (next) {
        setActiveIntent(next);
        setActiveTitle(undefined);
      }
    };
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  useEffect(() => {
    if (loading || explicitIntent || !supportedSurface()) return;
    let active = true;
    void (async () => {
      try {
        const intents = await loadInAppPostEventIntents();
        for (const intent of intents) {
          if (dismissedKeys.has(intent.key)) continue;
          if (await isPostEventIntentActionable(intent)) {
            if (active) setPrompt(intent);
            return;
          }
        }
        if (active) setPrompt(null);
      } catch {
        if (active) setPrompt(null);
      }
    })();
    return () => { active = false; };
  }, [dismissedKeys, explicitIntent, loading, refreshSequence]);

  const activeKey = useMemo(() => activeIntent
    ? activeIntent.feedbackId ? `participant:${activeIntent.feedbackId}` : `organizer:${activeIntent.activityId}`
    : "", [activeIntent]);

  const handleResolved = useCallback((complete: boolean) => {
    if (!complete || !activeKey) return;
    setDismissedKeys((current) => new Set(current).add(activeKey));
    setPrompt((current) => current?.key === activeKey ? null : current);
  }, [activeKey]);

  const closePanel = () => {
    setActiveIntent(null);
    setActiveTitle(undefined);
    if (explicitIntent) {
      window.history.replaceState({}, "", "/activities");
      setExplicitIntent(null);
    }
    setRefreshSequence((value) => value + 1);
  };

  return (
    <>
      {prompt && !activeIntent ? (
        <aside className="post-event-banner" aria-live="polite">
          <div><strong>{copy.bannerTitle}</strong><span>{prompt.title || copy.bannerBody}</span></div>
          <button className="post-event-banner-answer" type="button" onClick={() => { setActiveIntent({ activityId: prompt.activityId, ...(prompt.feedbackId ? { feedbackId: prompt.feedbackId } : {}) }); setActiveTitle(prompt.title); }}>{copy.answer}</button>
          <button className="post-event-banner-close" type="button" aria-label={copy.close} onClick={() => { setDismissedKeys((current) => new Set(current).add(prompt.key)); setPrompt(null); }}><X /></button>
        </aside>
      ) : null}
      {activeIntent ? <PostEventActionPanel intent={activeIntent} title={activeTitle} onClose={closePanel} onResolved={handleResolved} /> : null}
    </>
  );
}

let portalRoot: Root | null = null;
let portalContainer: HTMLDivElement | null = null;

export const enablePostEventInAppActions = () => {
  if (typeof document === "undefined" || portalRoot) return () => undefined;
  portalContainer = document.createElement("div");
  portalContainer.id = "go-irl-post-event-in-app";
  document.body.append(portalContainer);
  portalRoot = createRoot(portalContainer);
  portalRoot.render(<PostEventInAppPortal />);

  return () => {
    portalRoot?.unmount();
    portalRoot = null;
    portalContainer?.remove();
    portalContainer = null;
  };
};

export const postEventInAppCopy = () => currentCopy();
