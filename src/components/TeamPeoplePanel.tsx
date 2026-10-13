import { useEffect, useState } from "react";
import type { Language } from "../types";
import type { TeamPerson } from "../people/namedTeamsRepository";

const copy: Record<Language, { members: string; add: string; search: string; invite: string; invited: string; accept: string; decline: string; remove: string; close: string; empty: string; error: string }> = {
  ru: { members: "Участники", add: "Добавить участников", search: "Имя или Telegram username (от 3 символов)", invite: "Пригласить", invited: "Ожидает ответа", accept: "Принять", decline: "Отклонить", remove: "Исключить", close: "Закрыть", empty: "Ничего не найдено", error: "Не удалось выполнить действие" },
  uk: { members: "Учасники", add: "Додати учасників", search: "Ім’я або Telegram username (від 3 символів)", invite: "Запросити", invited: "Очікує відповіді", accept: "Прийняти", decline: "Відхилити", remove: "Виключити", close: "Закрити", empty: "Нічого не знайдено", error: "Не вдалося виконати дію" },
  en: { members: "Members", add: "Add members", search: "Name or Telegram username (3+ characters)", invite: "Invite", invited: "Pending", accept: "Accept", decline: "Decline", remove: "Remove", close: "Close", empty: "No results", error: "Action failed" },
  cs: { members: "Členové", add: "Přidat členy", search: "Jméno nebo Telegram username (3+ znaků)", invite: "Pozvat", invited: "Čeká se", accept: "Přijmout", decline: "Odmítnout", remove: "Odebrat", close: "Zavřít", empty: "Žádné výsledky", error: "Akce selhala" },
  pl: { members: "Członkowie", add: "Dodaj członków", search: "Imię lub Telegram username (min. 3 znaki)", invite: "Zaproś", invited: "Oczekuje", accept: "Akceptuj", decline: "Odrzuć", remove: "Usuń", close: "Zamknij", empty: "Brak wyników", error: "Błąd działania" },
  sk: { members: "Členovia", add: "Pridať členov", search: "Meno alebo Telegram username (3+ znaky)", invite: "Pozvať", invited: "Čaká sa", accept: "Prijať", decline: "Odmietnuť", remove: "Odobrať", close: "Zavrieť", empty: "Akcia zlyhala", error: "Akcia zlyhala" },
};

export function TeamPeoplePanel({ teamId, language, canInvite, isInvited, onLoad, onAction }: {
  teamId: string; language: Language; canInvite: boolean; isInvited: boolean;
  onLoad: (teamId: string, mode: "search" | "roster", query?: string) => Promise<TeamPerson[]>;
  onAction: (teamId: string, action: "add" | "accept" | "decline" | "remove", target?: string) => Promise<void>;
}) {
  const t = copy[language];
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<TeamPerson[]>([]);
  const [roster, setRoster] = useState<TeamPerson[]>([]);
  const [selected, setSelected] = useState<TeamPerson | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    void onLoad(teamId, "roster").then((rows) => { if (active) setRoster(rows); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [open, teamId, onLoad]);
  const search = async () => {
    if (term.trim().length < 3 || busy) return;
    setBusy(true); setError(false);
    try { setResults(await onLoad(teamId, "search", term)); } catch { setError(true); }
    finally { setBusy(false); }
  };
  const act = async (action: "add" | "accept" | "decline" | "remove", target?: string) => {
    if (busy) return;
    setBusy(true); setError(false);
    try {
      await onAction(teamId, action, target);
      setRoster(await onLoad(teamId, "roster"));
      setResults([]);
    } catch { setError(true); }
    finally { setBusy(false); }
  };
  const buttonStyle = { padding: "9px 13px", borderRadius: 10, border: "1px solid rgba(180,220,90,.45)", background: "rgba(145,190,50,.12)", color: "inherit", font: "inherit", cursor: "pointer", maxWidth: "100%" } as const;
  const rowStyle = { display: "flex", flexDirection: "column", alignItems: "stretch", gap: 9, padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.035)", minWidth: 0 } as const;
  const nameButton = (person: TeamPerson) => <button type="button" onClick={() => setSelected(person)} style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", color: "inherit", font: "inherit", overflowWrap: "anywhere", cursor: "pointer" }}>
    <strong>{person.displayName}</strong>{person.username ? <span style={{ display: "block", opacity: .7, fontSize: ".85em" }}>@{person.username}</span> : null}
  </button>;
  if (isInvited) return <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
    <button type="button" style={buttonStyle} disabled={busy} onClick={() => { void act("accept"); }}>{t.accept}</button>
    <button type="button" style={buttonStyle} disabled={busy} onClick={() => { void act("decline"); }}>{t.decline}</button>
    {error && <span role="alert">{t.error}</span>}
  </div>;
  return <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
    <button type="button" style={{ ...buttonStyle, justifySelf: "start" }} onClick={() => { setOpen(!open); setError(false); }}>{open ? t.close : canInvite ? t.add : t.members}</button>
    {open && <>
      <strong>{t.members}</strong>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8, minWidth: 0 }}>
        {roster.map((person) => <li key={person.userKey} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span>{person.displayName}{person.username ? ` (@${person.username})` : ""} — {person.role}{person.status === "invited" ? ` · ${t.invited}` : ""}</span>
          {canInvite && person.role !== "owner" && person.status === "active" && <button type="button" style={{ ...buttonStyle, alignSelf: "start" }} disabled={busy} onClick={() => { void act("remove", person.userKey); }}>{t.remove}</button>}
        </li>)}
      </ul>
      {canInvite && <form onSubmit={(event) => { event.preventDefault(); void search(); }} style={{ display: "grid", gap: 8 }}>
        <input aria-label={t.search} placeholder={t.search} value={term} maxLength={80} onChange={(event) => setTerm(event.target.value)} style={{ boxSizing: "border-box", width: "100%", minWidth: 0, padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,.24)", background: "rgba(255,255,255,.06)", color: "inherit", font: "inherit" }} />
        <button type="submit" style={buttonStyle} disabled={busy || term.trim().length < 3}>{t.add}</button>
      </form>}
      {results.length > 0 ? <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>{results.map((person) =>
        <li key={person.userKey} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span>{person.displayName}{person.username ? ` (@${person.username})` : ""}</span>
          <button type="button" disabled={busy} onClick={() => { void act("add", person.userKey); }}>{t.add}</button>
        </li>)}</ul> : null}
      {selected && <section aria-label={selected.displayName} style={{ ...rowStyle, borderColor: "rgba(180,220,90,.45)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
          <strong style={{ overflowWrap: "anywhere" }}>{selected.displayName}</strong>
          <button type="button" style={buttonStyle} onClick={() => setSelected(null)} aria-label={t.close}>×</button>
        </div>
        {selected.username && <span style={{ opacity: .8 }}>@{selected.username}</span>}
        {selected.role && <span style={{ opacity: .7 }}>{selected.role}</span>}
        {canInvite && selected.status !== "active" && selected.status !== "invited" && <button type="button" style={{ ...buttonStyle, justifySelf: "start" }} disabled={busy} onClick={() => { void act("add", selected.userKey); setSelected(null); }}>{t.add}</button>}
      </section>}
      {error && <p role="alert">{t.error}</p>}
    </>}
  </div>;
}
