import "../profile-roadmap-004-009.css";
import { useEffect, useMemo, useState } from "react";
import { getCurrentAuthIdentity } from "../authSession";
import {
  betaProfileInterestIds,
  favoriteLegacyInterestIds,
  loadProfileInterestsGoals,
  maxFavoriteProfileInterests,
  maxPrivateGoalLength,
  migrateLegacyFavoriteInterests,
  saveProfileInterestsGoals,
  setProfileInterestState,
  updatePrivateProfileGoal,
  type BetaProfileInterestId,
  type ProfileInterestState,
  type ProfileInterestsGoalsState,
} from "../profile/profileInterestsGoals";
import { createProfileRepository } from "../profile/profileRepository";
import type { UserProfile } from "../profile/profileTypes";
import { useAppStore } from "../store";
import { getUserKey, supabase } from "../supabase";
import type { Language } from "../types";

const labels: Record<Language, Record<BetaProfileInterestId, string>> = {
  ru: { volleyball: "Волейбол", running: "Бег", walking: "Прогулки", "coffee-meetup": "Встреча за кофе", "board-games": "Настольные игры", "language-exchange": "Языковой обмен" },
  uk: { volleyball: "Волейбол", running: "Біг", walking: "Прогулянки", "coffee-meetup": "Зустріч за кавою", "board-games": "Настільні ігри", "language-exchange": "Мовний обмін" },
  cs: { volleyball: "Volejbal", running: "Běh", walking: "Procházky", "coffee-meetup": "Setkání u kávy", "board-games": "Deskové hry", "language-exchange": "Jazyková výměna" },
  en: { volleyball: "Volleyball", running: "Running", walking: "Walking", "coffee-meetup": "Coffee meetup", "board-games": "Board games", "language-exchange": "Language exchange" },
};

const stateLabels: Record<Language, Record<ProfileInterestState | "none", string>> = {
  ru: { none: "Не выбрано", favorite: "Любимое", interested: "Интересно", want_to_try: "Хочу попробовать", hidden: "Скрыто" },
  uk: { none: "Не вибрано", favorite: "Улюблене", interested: "Цікаво", want_to_try: "Хочу спробувати", hidden: "Приховано" },
  cs: { none: "Nevybráno", favorite: "Oblíbené", interested: "Zajímá mě", want_to_try: "Chci zkusit", hidden: "Skryté" },
  en: { none: "Not selected", favorite: "Favorite", interested: "Interested", want_to_try: "Want to try", hidden: "Hidden" },
};

const copy: Record<Language, { title: string; hint: string; goal: string; goalHint: string; local: string; saveError: string }> = {
  ru: { title: "Интересы и цели", hint: `До ${maxFavoriteProfileInterests} любимых категорий. Остальные состояния остаются приватными.`, goal: "Личная цель", goalHint: "Например: чаще выходить из дома и знакомиться через спорт", local: "Личная цель хранится только на этом устройстве до появления защищённого backend.", saveError: "Не удалось сохранить интересы" },
  uk: { title: "Інтереси та цілі", hint: `До ${maxFavoriteProfileInterests} улюблених категорій. Інші стани залишаються приватними.`, goal: "Приватна ціль", goalHint: "Наприклад: частіше виходити з дому та знайомитися через спорт", local: "Приватна ціль зберігається лише на цьому пристрої до появи захищеного backend.", saveError: "Не вдалося зберегти інтереси" },
  cs: { title: "Zájmy a cíle", hint: `Až ${maxFavoriteProfileInterests} oblíbených kategorií. Ostatní stavy zůstávají soukromé.`, goal: "Soukromý cíl", goalHint: "Například: chodit častěji ven a poznávat lidi při sportu", local: "Soukromý cíl se do spuštění chráněného backendu ukládá jen v tomto zařízení.", saveError: "Zájmy se nepodařilo uložit" },
  en: { title: "Interests and goals", hint: `Up to ${maxFavoriteProfileInterests} favorite categories. Other states stay private.`, goal: "Private goal", goalHint: "For example: go out more often and meet people through sport", local: "The private goal stays on this device until protected backend storage is available.", saveError: "Could not save interests" },
};

export function ProfileInterestsGoalsSection({ language }: { language: Language }) {
  const selectedCityId = useAppStore((state) => state.selectedCityId);
  const identity = getCurrentAuthIdentity();
  const userKey = identity?.source === "trusted-telegram" ? identity.user.userKey : getUserKey();
  const repository = useMemo(() => createProfileRepository({ identity, supabaseClient: supabase, storage: localStorage, fallbackDisplayName: "GO IRL User", fallbackCityId: selectedCityId }), [userKey, selectedCityId]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [state, setState] = useState<ProfileInterestsGoalsState>(() => loadProfileInterestsGoals(localStorage, userKey));
  const [error, setError] = useState("");
  const text = copy[language];

  useEffect(() => {
    let active = true;
    const local = loadProfileInterestsGoals(localStorage, userKey);
    void repository.loadOwnProfile().then((loaded) => {
      if (!active || !loaded) return;
      const migrated = migrateLegacyFavoriteInterests(local, loaded.favoriteActivityIds);
      setProfile(loaded);
      setState(saveProfileInterestsGoals(localStorage, userKey, migrated));
    }).catch(() => { if (active) setError(text.saveError); });
    return () => { active = false; };
  }, [repository, text.saveError, userKey]);

  const persist = async (next: ProfileInterestsGoalsState) => {
    setState(saveProfileInterestsGoals(localStorage, userKey, next));
    if (!profile) return;
    setError("");
    try {
      const saved = await repository.saveOwnProfile({ displayName: profile.displayName, bio: profile.bio, cityId: profile.cityId, avatarPath: profile.avatarPath, avatarCode: profile.avatarCode, isPublic: profile.isPublic, showFavorites: profile.showFavorites, favoriteActivityIds: favoriteLegacyInterestIds(next) });
      setProfile(saved);
    } catch { setError(text.saveError); }
  };

  return (
    <details className="profile-interests-goals">
      <summary aria-labelledby="profile-interests-title">
        <span>
          <strong id="profile-interests-title">{text.title}</strong>
          <small>{text.hint}</small>
        </span>
      </summary>
      <div className="profile-interests-goals-body">
        <div className="profile-interest-state-list">
          {betaProfileInterestIds.map((id) => <label key={id}><span>{labels[language][id]}</span><select value={state.interests[id] || "none"} onChange={(event) => { const value = event.target.value === "none" ? null : event.target.value as ProfileInterestState; try { void persist(setProfileInterestState(state, id, value)); } catch { setError(text.saveError); } }}>{(Object.keys(stateLabels[language]) as Array<ProfileInterestState | "none">).map((value) => <option key={value} value={value}>{stateLabels[language][value]}</option>)}</select></label>)}
        </div>
        <label className="profile-private-goal"><span>{text.goal}</span><textarea maxLength={maxPrivateGoalLength} rows={3} value={state.privateGoal} placeholder={text.goalHint} onChange={(event) => setState(updatePrivateProfileGoal(state, event.target.value))} onBlur={() => { void persist(state); }} /><small>{text.local}</small></label>
        {error ? <div className="details-error profile-error" role="alert">{error}</div> : null}
      </div>
    </details>
  );
}
