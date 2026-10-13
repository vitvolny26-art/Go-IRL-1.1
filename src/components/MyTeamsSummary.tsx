import { useState } from "react";
import type { Language } from "../types";
import type { OwnTeamSummary } from "../people/ownTeams";

const copy: Record<Language, { title: string; empty: string; invited: string; active: string; owner: string; admin: string; member: string; leave: string; error: string }> = {
  ru: { title: "Мои команды", empty: "Пока нет команд", invited: "Приглашение ожидает ответа", active: "Участник", owner: "Владелец", admin: "Администратор", member: "Участник", leave: "Покинуть команду", error: "Не удалось выполнить действие" },
  uk: { title: "Мої команди", empty: "Команд поки немає", invited: "Запрошення очікує відповіді", active: "Учасник", owner: "Власник", admin: "Адміністратор", member: "Учасник", leave: "Залишити команду", error: "Не вдалося виконати дію" },
  en: { title: "My teams", empty: "No teams yet", invited: "Invitation pending", active: "Member", owner: "Owner", admin: "Admin", member: "Member", leave: "Leave team", error: "Team action failed" },
  cs: { title: "Moje týmy", empty: "Zatím žádné týmy", invited: "Čekající pozvánka", active: "Člen", owner: "Vlastník", admin: "Správce", member: "Člen", leave: "Opustit tým", error: "Akce týmu se nezdařila" },
  pl: { title: "Moje zespoły", empty: "Brak zespołów", invited: "Oczekujące zaproszenie", active: "Członek", owner: "Właściciel", admin: "Administrator", member: "Członek", leave: "Opuść zespół", error: "Nie udało się wykonać działania" },
  sk: { title: "Moje tímy", empty: "Zatiaľ žiadne tímy", invited: "Čakajúca pozvánka", active: "Člen", owner: "Vlastník", admin: "Správca", member: "Člen", leave: "Opustiť tím", error: "Akcia tímu zlyhala" },
};

/** Membership changes are authorized by the server; this component only requests them. */
export function MyTeamsSummary({ language, teams, onAction }: { language: Language; teams: readonly OwnTeamSummary[]; onAction?: (teamId: string, action: "invite" | "accept" | "decline" | "leave", targetUserKey?: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const act = async (teamId: string, action: "leave") => {
    if (!onAction || busy) return;
    setBusy(true); setError(false);
    try { await onAction(teamId, action, undefined); }
    catch { setError(true); }
    finally { setBusy(false); }
  };
  const labels = copy[language];
  return (
    <section className="profile-lifecycle-summary" aria-label={labels.title}>
      <h3>{labels.title}</h3>
      {teams.length === 0 ? <p>{labels.empty}</p> : (
        <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: 12 }}>
          {teams.map(({ team, membership }) => (
            <li key={team.id} style={{ minWidth: 0, padding: 16, border: "1px solid rgba(255,255,255,0.14)", borderRadius: 16, background: "rgba(255,255,255,0.035)", display: "grid", gap: 10 }}>
              <strong style={{ overflowWrap: "anywhere", fontSize: "1.05rem" }}>{team.name}</strong>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: "0.88rem", opacity: 0.85 }}>
                <span style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid currentColor" }}>{labels[membership.role]}</span>
                <span>{membership.status === "invited" ? labels.invited : labels.active}</span>
              </span>
              {onAction && membership.status === "active" && membership.role !== "owner" ? <button type="button" disabled={busy} onClick={() => { void act(team.id, "leave"); }} style={{ justifySelf: "start", padding: "10px 14px", borderRadius: 12, border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: busy ? "wait" : "pointer" }}>{labels.leave}</button> : null}
            </li>
          ))}
        </ul>
      )}
      {error ? <p role="alert">{labels.error}</p> : null}
    </section>
  );
}
