import { useEffect, useMemo, useState } from "react";
import "../profile-roadmap-004-009.css";
import {
  getCurrentAuthIdentity,
  initializeTrustedAuth,
  trustedAuthSessionChangedEvent,
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

type PersistenceStatus = "loading" | "ready" | "saving" | "load-error" | "save-error" | "auth-required";

const copy: Record<Language, {
  title: string;
  hint: string;
  catalog: string;
  level: string;
  privateState: string;
  loading: string;
  saving: string;
  loadError: string;
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
    loadError: "Не удалось загрузить сохранённые роли.",
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
    loadError: "Не вдалося завантажити збережені ролі.",
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
    loadError: "Uložené role se nepodařilo načíst.",
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
    loadError: "Could not load saved roles.",
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
    loadError: "Nie udało się wczytać zapisanych ról.",
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
    loadError: "Uložené roly sa nepodarilo načítať.",
    saveError: "Roly sa nepodarilo uložiť. Skúste to znova.",
    authRequired: "Na uloženie rolí je potrebné prihlásenie.",
  },
};

const isTrustedIdentity = (identity: ReturnType<typeof getCurrentAuthIdentity>) =>
  identity?.source === "trusted-telegram" || identity?.source === "trusted-provider";

const getTrustedRoleInterestActor = () => {
  const identity = getCurrentAuthIdentity();
  return isTrustedIdentity(identity) ? identity?.user.userKey || null : null;
};

export function ProfileRolesSection({ language }: { language: Language }) {
  const text = copy[language];
  const roles = buildProfileRoleCatalogViewModel(language);
  const repository = useMemo(() => new SupabaseProfileRoleInterestRepository(supabase), []);
  const [actor, setActor] = useState(getTrustedRoleInterestActor);
  const [levelsByRole, setLevelsByRole] = useState<ProfileRoleInterestSelection>({});
  const [status, setStatus] = useState<PersistenceStatus>("loading");

  useEffect(() => {
    const refresh = () => setActor(getTrustedRoleInterestActor());
    window.addEventListener(trustedAuthSessionChangedEvent, refresh);
    return () => window.removeEventListener(trustedAuthSessionChangedEvent, refresh);
  }, []);

  useEffect(() => {
    let active = true;

    if (!actor) {
      setLevelsByRole({});
      setStatus("loading");
      void initializeTrustedAuth()
        .then((identity) => {
          if (!active) return;
          if (isTrustedIdentity(identity)) {
            setActor(identity?.user.userKey || null);
          } else {
            setStatus("auth-required");
          }
        })
        .catch(() => {
          if (active) setStatus("auth-required");
        });
      return () => {
        active = false;
      };
    }

    setStatus("loading");
    void repository.loadOwnRoleInterests()
      .then((loaded) => {
        if (active && getTrustedRoleInterestActor() === actor) {
          setLevelsByRole(loaded);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (active && getTrustedRoleInterestActor() === actor) setStatus("load-error");
      });

    return () => {
      active = false;
    };
  }, [actor, repository]);

  const selectLevel = async (
    roleId: ProfileRoleViewModel["id"],
    levelId: ProfileRoleInterestLevelId,
  ) => {
    if (status === "loading" || status === "saving" || status === "load-error" || status === "auth-required") return;

    if (!actor) return;
    const savingActor = actor;
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
      if (getTrustedRoleInterestActor() !== savingActor) return;
      setLevelsByRole(saved);
      setStatus("ready");
    } catch {
      if (getTrustedRoleInterestActor() !== savingActor) return;
      setLevelsByRole(previous);
      setStatus("save-error");
    }
  };

  const disabled = status === "loading" || status === "saving" || status === "load-error" || status === "auth-required";
  const statusMessage = status === "loading"
    ? text.loading
    : status === "saving"
      ? text.saving
      : status === "load-error"
        ? text.loadError
        : status === "save-error"
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
          className={`profile-role-catalog-note${status === "load-error" || status === "save-error" ? " is-error" : ""}`}
          role={status === "load-error" || status === "save-error" ? "alert" : "status"}
        >
          {statusMessage}
        </small>
      </div>
    </details>
  );
}
