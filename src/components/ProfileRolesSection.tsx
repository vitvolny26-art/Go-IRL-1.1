import { useState } from "react";
import "../profile-roadmap-004-009.css";
import {
  getProfileRoleInterestLevelLabel,
  profileRoleInterestLevelIds,
  type ProfileRoleInterestLevelId,
} from "../profile/profileRoleInterestLevels";
import {
  buildProfileRoleCatalogViewModel,
  type ProfileRoleViewModel,
} from "../profile/profileRoleViewModel";
import type { Language } from "../types";

type RoleLevelSelection = Partial<Record<ProfileRoleViewModel["id"], ProfileRoleInterestLevelId>>;

const copy: Record<Language, { title: string; hint: string; catalog: string; level: string; pending: string }> = {
  ru: {
    title: "Профессии и роли",
    hint: "Единый каталог ролей для Activities, профиля и будущей ролевой репутации.",
    catalog: "Доступные роли",
    level: "Уровень интереса",
    pending: "Выбор уровня работает как прототип и пока не сохраняется после закрытия страницы.",
  },
  uk: {
    title: "Професії та ролі",
    hint: "Єдиний каталог ролей для Activities, профілю та майбутньої репутації за ролями.",
    catalog: "Доступні ролі",
    level: "Рівень інтересу",
    pending: "Вибір рівня працює як прототип і поки не зберігається після закриття сторінки.",
  },
  cs: {
    title: "Profese a role",
    hint: "Jeden katalog rolí pro Activities, profil a budoucí reputaci podle rolí.",
    catalog: "Dostupné role",
    level: "Úroveň zájmu",
    pending: "Volba úrovně funguje jako prototyp a po zavření stránky se zatím neukládá.",
  },
  en: {
    title: "Professions and roles",
    hint: "One role catalog for Activities, Profile and future role-specific reputation.",
    catalog: "Available roles",
    level: "Interest level",
    pending: "Level selection is a prototype and is not persisted after the page is closed yet.",
  },
};

export function ProfileRolesSection({ language }: { language: Language }) {
  const text = copy[language];
  const roles = buildProfileRoleCatalogViewModel(language);
  const [levelsByRole, setLevelsByRole] = useState<RoleLevelSelection>({});

  const selectLevel = (roleId: ProfileRoleViewModel["id"], levelId: ProfileRoleInterestLevelId) => {
    setLevelsByRole((current) => {
      if (current[roleId] === levelId) {
        const next = { ...current };
        delete next[roleId];
        return next;
      }
      return { ...current, [roleId]: levelId };
    });
  };

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
                      key={levelId}
                      onClick={() => selectLevel(role.id, levelId)}
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
        <small className="profile-role-catalog-note">{text.pending}</small>
      </div>
    </details>
  );
}
