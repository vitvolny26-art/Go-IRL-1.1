import { useEffect, useMemo, useState } from "react";
import "../profile-roadmap-004-009.css";
import {
  getCurrentAuthIdentity,
  initializeTrustedAuth,
} from "../authSession";
import {
  getProfileRoleInterestLevelLabel,
  profileRoleInterestLevelIds,
  type ProfileRoleInterestLevelId,
} from "../profile/profileRoleInterestLevels";
import {
  setProfileRoleInterest,
  type ProfileRoleInterestSelection,
} from "../profile/profileRoleInterestPersistence";
import { SupabaseProfileRoleInterestRepository } from "../profile/profileRoleInterestRepository";
import {
  buildProfileRoleCatalogViewModel,
  type ProfileRoleViewModel,
} from "../profile/profileRoleViewModel";
import { supabase } from "../supabase";
import type { Language } from "../types";

type PersistenceStatus = "loading" | "ready" | "saving" | "error" | "auth-required";

const copy: Record<Language, {
  title: string;
  hint: string;
  catalog: string;
  level: string;
  privateState: string;
  loading: string;
  saving: string;
  saveError: string;
  authRequired: string;
}> = {
  ru: {
    title: "Профессии и роли",
    hint: "Единый каталог ролей для Activities, профиля и будущей ролевой репутации.",
    catalog: "Доступные роли",
    level: "Уровень интереса",
    privateState: "Выбор сохраняется приватно в вашем профиле.",
    loading: "Загружаем роли…",
    saving: "Сохраняем…",
    saveError: "Не удалось сохранить роли. Попробуйте ещё раз.",
    authRequired: "Для сохранения ролей нужна авторизация.",
  },
  uk: {
    title: "Професії та ролі",
    hint: "Єдиний каталог ролей для Activities, профілю та майбутньої репутації за ролями.",
    catalog: "Доступні ролі",
    level: "Рівень інтересу",
    privateState: "Вибір приватно зберігається у вашому профілі.",
    loading: "Завантажуємо ролі…",
    saving: "Зберігаємо…",
    saveError: "Не вдалося зберегти ролі. Спробуйте ще раз.",
    authRequired: "Для збереження ролей потрібна авторизація.",
  },
  cs: {
    title: "Profese a role",
    hint: "Jeden katalog rolí pro Activities, profil a budoucí reputaci podle rolí.",
    catalog: "Dostupné role",
    level: "Úroveň zájmu",
    privateState: "Výběr se soukromě ukládá do vašeho profilu.",
    loading: "Načítáme role…",
    saving: "Ukládáme…",
    saveError: "Role se nepodařilo uložit. Zkuste to znovu.",
    authRequired: "Pro uložení rolí je nutné přihlášení.",
  },
  en: {
    title: "Professions and roles",
    hint: "One role catalog for Activities, Profile and future role-specific reputation.",
    catalog: "Available roles",
    level: "Interest level",
    privateState: "Your selection is saved privately to your profile.",
    loading: "Loading roles…",
    saving: "Saving…",
    saveError: "Could not save roles. Please try again.",
    authRequired: "Sign in to save role interests.",
  },
  pl: {
    title: "Zawody i role",
    hint: "Jeden katalog ról dla Activities, profilu i przyszłej reputacji według ról.",
    catalog: "Dostępne role",
    level: "Poziom zainteresowania",
    privateState: "Wybór jest zapisywany prywatnie w Twoim profilu.",
    loading: "Ładowanie ról…",
    saving: "Zapisywanie…",
    saveError: "Nie udało się zapisać ról. Spróbuj ponownie.",
    authRequired: "Zaloguj się, aby zapisać zainteresowanie rolami.",
  },
  sk: {
    title: "Profesie a roly",
    hint: "Jeden katalóg rolí pre Activities, profil a budúcu reputáciu podľa rolí.",
    catalog: "Dostupné roly",
    level: "Úroveň záujmu",
    privateState: "Výber sa súkromne ukladá do vášho profilu.",
    loading: "Načítavame roly…",
    saving: "Ukladáme…",
    saveError: "Roly sa nepodarilo uložiť. Skúste to znova.",
    authRequired: "Na uloženie rolí je potrebné prihlásenie.",
  },
};

const isTrustedIdentity = (identity: ReturnType<typeof getCurrentAuthIdentity>) =>
  identity?.source === "trusted-telegram" || identity?.source === "trusted-provider";

export function ProfileRolesSection({ language }: { language: Language }) {
  const text = copy[language];
  const roles = buildProfileRoleCatalogViewModel(language);
  const repository = useMemo(() => new SupabaseProfileRoleInterestRepository(supabase), []);
  const [levelsByRole, setLevelsByRole] = useState<ProfileRoleInterestSelection>({});
  const [status, setStatus] = useState<PersistenceStatus>("loading");

  useEffect(() => {
    let active = true;

    const load = async () => {
      setStatus("loading");
      try {
        const currentIdentity = getCurrentAuthIdentity();
        const identity = isTrustedIdentity(currentIdentity)
          ? currentIdentity
          : await initializeTrustedAuth();

        if (!isTrustedIdentity(identity)) {
          if (active) {
            setLevelsByRole({});
            setStatus("auth-required");
          }
          return;
        }

        const loaded = await repository.loadOwnRoleInterests();
        if (active) {
          setLevelsByRole(loaded);
          setStatus("ready");
        }
      } catch {
        if (active) setStatus("error");
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [repository]);

  const selectLevel = async (
    roleId: ProfileRoleViewModel["id"],
    levelId: ProfileRoleInterestLevelId,
  ) => {
    if (status === "loading" || status === "saving" || status === "auth-required") return;

    const previous = levelsByRole;
    const next = setProfileRoleInterest(
      previous,
      roleId,
      previous[roleId] === levelId ? null : levelId,
    );

    setLevelsByRole(next);
    setStatus("saving");

    try {
      const saved = await repository.saveOwnRoleInterests(next);
      setLevelsByRole(saved);
      setStatus("ready");
    } catch {
      setLevelsByRole(previous);
      setStatus("error");
    }
  };

  const disabled = status === "loading" || status === "saving" || status === "auth-required";
  const statusMessage = status === "loading"
    ? text.loading
    : status === "saving"
      ? text.saving
      : status === "error"
        ? text.saveError
        : status === "auth-required"
          ? text.authRequired
          : text.privateState;

  return (
    <details className="profile-interests-goals profile-role-catalog">
      <summary aria-labelledby="profile-roles-title">
        <span>
          <strong id="profile-roles-title">{text.title}</strong>
          <small>{text.hint}</small>
        </span>
      </summary>
      <div className="profile-interests-goals-body">
        <div className="profile-role-catalog-heading">{text.catalog}</div>
        <div className="profile-role-catalog-list">
          {roles.map((role) => (
            <div className="profile-role-card" data-profile-role-id={role.id} key={role.id}>
              <strong className="profile-role-label">{role.label}</strong>
              <div className="profile-role-levels" role="group" aria-label={`${role.label}: ${text.level}`}>
                {profileRoleInterestLevelIds.map((levelId) => {
                  const selected = levelsByRole[role.id] === levelId;
                  return (
                    <button
                      aria-pressed={selected}
                      className={`profile-role-level${selected ? " is-selected" : ""}`}
                      data-profile-role-level={levelId}
                      disabled={disabled}
                      key={levelId}
                      onClick={() => { void selectLevel(role.id, levelId); }}
                      type="button"
                    >
                      {getProfileRoleInterestLevelLabel(levelId, language)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <small
          className={`profile-role-catalog-note${status === "error" ? " is-error" : ""}`}
          role={status === "error" ? "alert" : "status"}
        >
          {statusMessage}
        </small>
      </div>
    </details>
  );
}
