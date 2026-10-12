import { useState } from "react";
import type { Language } from "../types";
import type { OwnTeamSummary } from "../people/ownTeams";

const copy: Record<Language, { title: string; empty: string; invited: string; active: string; owner: string; admin: string; member: string }> = {
  ru: { title: "Мои команды", empty: "Пока нет команд", invited: "Приглашение ожидает ответа", active: "Участник", owner: "Владелец", admin: "Администратор", member: "Участник" },
  uk: { title: "Мої команди", empty: "Команд поки немає", invited: "Запрошення очікує відповіді", active: "Учасник", owner: "Власник", admin: "Адміністратор", member: "Учасник" },
  en: { title: "My teams", empty: "No teams yet", invited: "Invitation pending", active: "Member", owner: "Owner", admin: "Admin", member: "Member" },
  cs: { title: "Moje týmy", empty: "Zatím žádné týmy", invited: "Čekající pozvánka", active: "Člen", owner: "Vlastník", admin: "Správce", member: "Člen" },
  pl: { title: "Moje zespoły", empty: "Brak zespołów", invited: "Oczekujące zaproszenie", active: "Członek", owner: "Właściciel", admin: "Administrator", member: "Członek" },
  sk: { title: "Moje tímy", empty: "Zatiaľ žiadne tímy", invited: "Čakajúca pozvánka", active: "Člen", owner: "Vlastník", admin: "Správca", member: "Člen" },
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
              {onAction && membership.status === "invited" ? <div><button type="button" disabled={busy} onClick={() => { void act(team.id, "accept"); }}>{language === "ru" ? "Принять" : "Accept"}</button> <button type="button" disabled={busy} onClick={() => { void act(team.id, "decline"); }}>{language === "ru" ? "Отклонить" : "Decline"}</button></div> : null}
              {onAction && membership.status === "active" && membership.role !== "owner" ? <button type="button" disabled={busy} onClick={() => { void act(team.id, "leave"); }}>{language === "ru" ? "Покинуть команду" : "Leave team"}</button> : null}
              {onAction && membership.status === "active" && (membership.role === "owner" || membership.role === "admin") ? <div><input aria-label={language === "ru" ? "Ключ пользователя для приглашения" : "User key to invite"} value={target[team.id] || ""} onChange={(event) => setTarget((prev) => ({ ...prev, [team.id]: event.target.value }))} /><button type="button" disabled={busy || !target[team.id]?.trim()} onClick={() => { void act(team.id, "invite"); }}>{language === "ru" ? "Пригласить" : "Invite"}</button></div> : null}
            </li>
          ))}
        </ul>
      )}
      {error ? <p role="alert">{language === "ru" ? "Не удалось выполнить действие" : "Team action failed"}</p> : null}
    </section>
  );
}
