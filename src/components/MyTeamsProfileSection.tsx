import { useEffect, useState } from "react";
import { getNamedTeamsActorUserKey } from "../people/namedTeamsActor";
import { SupabaseNamedTeamsRepository } from "../people/namedTeamsRepository";
import { selectOwnTeams, type OwnTeamSummary } from "../people/ownTeams";
import { supabase } from "../supabase";
import type { Language } from "../types";
import { MyTeamsSummary } from "./MyTeamsSummary";
import { CreateNamedTeamForm } from "./CreateNamedTeamForm";

const messages: Record<Language, { unavailable: string; loading: string; error: string }> = {
  ru: { unavailable: "Войдите в аккаунт, чтобы видеть команды", loading: "Загрузка команд…", error: "Не удалось загрузить команды" },
  uk: { unavailable: "Увійдіть в акаунт, щоб бачити команди", loading: "Завантаження команд…", error: "Не вдалося завантажити команди" },
  en: { unavailable: "Sign in to view teams", loading: "Loading teams…", error: "Could not load teams" },
  cs: { unavailable: "Přihlaste se pro zobrazení týmů", loading: "Načítání týmů…", error: "Nepodařilo se načíst týmy" },
  pl: { unavailable: "Zaloguj się, aby zobaczyć zespoły", loading: "Ładowanie zespołów…", error: "Nie udało się wczytać zespołów" },
  sk: { unavailable: "Prihláste sa pre zobrazenie tímov", loading: "Načítavanie tímov…", error: "Nepodarilo sa načítať tímy" },
};

/** Read-only profile projection. Backend migration remains a separate release gate. */
export function MyTeamsProfileSection({ language }: { language: Language }) {
  const actor = getNamedTeamsActorUserKey();
  const [state, setState] = useState<{ actor: string | null; teams: OwnTeamSummary[]; status: "loading" | "ready" | "error" }>({
    actor, teams: [], status: "loading",
  });
  useEffect(() => {
    if (!actor) return;
    let active = true;
    const repository = new SupabaseNamedTeamsRepository(supabase, actor);
    void Promise.all([repository.listTeams(), repository.listOwnMemberships()])
      .then(([teams, memberships]) => {
        if (active) setState({ actor, teams: selectOwnTeams(teams, memberships, actor), status: "ready" });
      })
      .catch(() => {
        if (active) setState({ actor, teams: [], status: "error" });
      });
    return () => { active = false; };
  }, [actor]);
  const labels = messages[language];
  if (!actor) return <p>{labels.unavailable}</p>;
  if (state.actor !== actor || state.status === "loading") return <p role="status">{labels.loading}</p>;
  if (state.status === "error") return <p role="alert">{labels.error}</p>;
  const createTeam = async (name: string) => {
    const created = await new SupabaseNamedTeamsRepository(supabase, actor).createTeam(name);
    const repository = new SupabaseNamedTeamsRepository(supabase, actor);
    const memberships = await repository.listOwnMemberships();
    const teams = await repository.listTeams();
    if (!memberships.some((membership) => membership.teamId === created.id && membership.userKey === actor && membership.status === "active")) {
      throw new Error("named_team_owner_membership_not_visible");
    }
    setState({ actor, teams: selectOwnTeams(teams, memberships, actor), status: "ready" });
  };
  return <><MyTeamsSummary language={language} teams={state.teams} /><CreateNamedTeamForm language={language} onCreate={createTeam} /></>;
}
