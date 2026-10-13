import { useCallback, useEffect, useState } from "react";
import { trustedAuthSessionChangedEvent } from "../authSession";
import { getNamedTeamsActorUserKey } from "../people/namedTeamsActor";
import { SupabaseNamedTeamsRepository } from "../people/namedTeamsRepository";
import { selectOwnTeams, type OwnTeamSummary } from "../people/ownTeams";
import { supabase } from "../supabase";
import type { Language } from "../types";
import { MyTeamsSummary } from "./MyTeamsSummary";
import type { TeamPerson } from "../people/namedTeamsRepository";
import { CreateNamedTeamForm } from "./CreateNamedTeamForm";

const messages: Record<Language, { unavailable: string; loading: string; error: string }> = {
  ru: { unavailable: "Войдите в аккаунт, чтобы видеть команды", loading: "Загрузка команд…", error: "Не удалось загрузить команды" },
  uk: { unavailable: "Увійдіть в акаунт, щоб бачити команди", loading: "Завантаження команд…", error: "Не вдалося завантажити команди" },
  en: { unavailable: "Sign in to view teams", loading: "Loading teams…", error: "Could not load teams" },
  cs: { unavailable: "Přihlaste se pro zobrazení týmů", loading: "Načítání týmů…", error: "Nepodařilo se načíst týmy" },
  pl: { unavailable: "Zaloguj się, aby zobaczyć zespoły", loading: "Ładowanie zespołów…", error: "Nie udało się wczytać zespołów" },
  sk: { unavailable: "Prihláste sa pre zobrazenie tímov", loading: "Načítavanie tímov…", error: "Nepodarilo sa načítať tímy" },
};

/** Authenticated team profile; database ownership rules are enforced by RLS. */
export function MyTeamsProfileSection({ language }: { language: Language }) {
  const [actor, setActor] = useState(getNamedTeamsActorUserKey);
  useEffect(() => {
    const refresh = () => setActor(getNamedTeamsActorUserKey());
    window.addEventListener(trustedAuthSessionChangedEvent, refresh);
    return () => window.removeEventListener(trustedAuthSessionChangedEvent, refresh);
  }, []);
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
  const loadPeople = useCallback((teamId: string, mode: "search" | "roster", query?: string): Promise<TeamPerson[]> =>
    new SupabaseNamedTeamsRepository(supabase, actor ?? "").listTeamPeople(teamId, mode, query), [actor]);
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
    if (getNamedTeamsActorUserKey() !== actor) return;
    setState({ actor, teams: selectOwnTeams(teams, memberships, actor), status: "ready" });
  };
  const membershipAction = async (teamId: string, action: "invite" | "accept" | "decline" | "leave", targetUserKey?: string) => {
    const repository = new SupabaseNamedTeamsRepository(supabase, actor);
    await repository.membershipAction(teamId, action, targetUserKey);
    const [teams, memberships] = await Promise.all([repository.listTeams(), repository.listOwnMemberships()]);
    if (getNamedTeamsActorUserKey() !== actor) return;
    setState({ actor, teams: selectOwnTeams(teams, memberships, actor), status: "ready" });
  };
  const peopleAction = async (teamId: string, action: "invite" | "accept" | "decline" | "remove", target?: string) => {
    const repository = new SupabaseNamedTeamsRepository(supabase, actor);
    await repository.membershipAction(teamId, action, target);
    const [teams, memberships] = await Promise.all([repository.listTeams(), repository.listOwnMemberships()]);
    if (getNamedTeamsActorUserKey() !== actor) return;
    setState({ actor, teams: selectOwnTeams(teams, memberships, actor), status: "ready" });
  };
  const manageTeam = async (teamId: string, action: "rename" | "delete", name?: string) => {
    const repository = new SupabaseNamedTeamsRepository(supabase, actor);
    await repository.manageTeam(teamId, action, name);
    const [teams, memberships] = await Promise.all([repository.listTeams(), repository.listOwnMemberships()]);
    if (getNamedTeamsActorUserKey() !== actor) return;
    setState({ actor, teams: selectOwnTeams(teams, memberships, actor), status: "ready" });
  };
  return <><MyTeamsSummary language={language} teams={state.teams} onAction={membershipAction} onManage={manageTeam} onLoadPeople={loadPeople} onPeopleAction={peopleAction} /><CreateNamedTeamForm language={language} onCreate={createTeam} /></>;
}
