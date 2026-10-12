import { useState } from "react";
import type { Language } from "../types";
import type { OwnTeamSummary } from "../people/ownTeams";

const copy: Record<Language, { title: string; empty: string; invited: string; active: string; owner: string; admin: string; member: string; accept: string; decline: string; leave: string; target: string; invite: string; error: string }> = {
  ru: { title: "Мои команды", empty: "Пока нет команд", invited: "Приглашение ожидает ответа", active: "Участник", owner: "Владелец", admin: "Администратор", member: "Участник", accept: "Принять", decline: "Отклонить", leave: "Покинуть команду", target: "Ключ пользователя для приглашения", invite: "Пригласить", error: "Не удалось выполнить действие" },
  uk: { title: "Мої команди", empty: "Команд поки немає", invited: "Запрошення очікує відповіді", active: "Учасник", owner: "Власник", admin: "Адміністратор", member: "Учасник", accept: "Прийняти", decline: "Відхилити", leave: "Залишити команду", target: "Ключ користувача для запрошення", invite: "Запросити", error: "Не вдалося виконати дію" },
  en: { title: "My teams", empty: "No teams yet", invited: "Invitation pending", active: "Member", owner: "Owner", admin: "Admin", member: "Member", accept: "Accept", decline: "Decline", leave: "Leave team", target: "User key to invite", invite: "Invite", error: "Team action failed" },
  cs: { title: "Moje týmy", empty: "Zatím žádné týmy", invited: "Čekající pozvánka", active: "Člen", owner: "Vlastník", admin: "Správce", member: "Člen", accept: "Přijmout", decline: "Odmítnout", leave: "Opustit tým", target: "Klíč uživatele k pozvání", invite: "Pozvat", error: "Akce týmu se nezdařila" },
  pl: { title: "Moje zespoły", empty: "Brak zespołów", invited: "Oczekujące zaproszenie", active: "Członek", owner: "Właściciel", admin: "Administrator", member: "Członek", accept: "Akceptuj", decline: "Odrzuć", leave: "Opuść zespół", target: "Klucz użytkownika do zaproszenia", invite: "Zaproś", error: "Nie udało się wykonać działania" },
  sk: { title: "Moje tímy", empty: "Zatiaľ žiadne tímy", invited: "Čakajúca pozvánka", active: "Člen", owner: "Vlastník", admin: "Správca", member: "Člen", accept: "Prijať", decline: "Odmietnuť", leave: "Opustiť tím", target: "Kľúč používateľa na pozvanie", invite: "Pozvať", error: "Akcia tímu zlyhala" },
};

/** Membership changes are authorized by the server; this component only requests them. */
export function MyTeamsSummary({ language, teams, onAction }: { language: Language; teams: readonly OwnTeamSummary[]; onAction?: (teamId: string, action: "invite" | "accept" | "decline" | "leave", targetUserKey?: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [target, setTarget] = useState<Record<string, string>>({});
  const act = async (teamId: string, action: "invite" | "accept" | "decline" | "leave") => {
    if (!onAction || busy) return;
    setBusy(true); setError(false);
    try { await onAction(teamId, action, action === "invite" ? target[teamId] : undefined); }
    catch { setError(true); }
    finally { setBusy(false); }
  };
  const labels = copy[language];
  return (
    <section className="profile-lifecycle-summary" aria-label={labels.title}>
      <h3>{labels.title}</h3>
      {teams.length === 0 ? <p>{labels.empty}</p> : (
        <ul>
          {teams.map(({ team, membership }) => (
            <li key={team.id}>
              <strong>{team.name}</strong>
              <span> — {labels[membership.role]}, {membership.status === "invited" ? labels.invited : labels.active}</span>
              {onAction && membership.status === "invited" ? <div><button type="button" disabled={busy} onClick={() => { void act(team.id, "accept"); }}>{labels.accept}</button> <button type="button" disabled={busy} onClick={() => { void act(team.id, "decline"); }}>{labels.decline}</button></div> : null}
              {onAction && membership.status === "active" && membership.role !== "owner" ? <button type="button" disabled={busy} onClick={() => { void act(team.id, "leave"); }}>{labels.leave}</button> : null}
              {onAction && membership.status === "active" && (membership.role === "owner" || membership.role === "admin") ? <div><input aria-label={labels.target} value={target[team.id] || ""} onChange={(event) => setTarget((prev) => ({ ...prev, [team.id]: event.target.value }))} /><button type="button" disabled={busy || !target[team.id]?.trim()} onClick={() => { void act(team.id, "invite"); }}>{labels.invite}</button></div> : null}
            </li>
          ))}
        </ul>
      )}
      {error ? <p role="alert">{labels.error}</p> : null}
    </section>
  );
}
