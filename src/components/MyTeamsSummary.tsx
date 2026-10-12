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

/** Read-only until authenticated persistence and server membership actions are available. */
export function MyTeamsSummary({ language, teams }: { language: Language; teams: readonly OwnTeamSummary[] }) {
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
