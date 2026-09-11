import "../profile-roadmap-004-009.css";
import { buildProfileRoleCatalogViewModel } from "../profile/profileRoleViewModel";
import type { Language } from "../types";

const copy: Record<Language, { title: string; hint: string; catalog: string; pending: string }> = {
  ru: {
    title: "Профессии и роли",
    hint: "Единый каталог ролей для Activities, профиля и будущей ролевой репутации.",
    catalog: "Доступные роли",
    pending: "Выбор уровня интереса и сохранение появятся после утверждения модели role-interest.",
  },
  uk: {
    title: "Професії та ролі",
    hint: "Єдиний каталог ролей для Activities, профілю та майбутньої репутації за ролями.",
    catalog: "Доступні ролі",
    pending: "Вибір рівня інтересу та збереження з’являться після затвердження моделі role-interest.",
  },
  cs: {
    title: "Profese a role",
    hint: "Jeden katalog rolí pro Activities, profil a budoucí reputaci podle rolí.",
    catalog: "Dostupné role",
    pending: "Volba úrovně zájmu a ukládání budou doplněny po schválení modelu role-interest.",
  },
  en: {
    title: "Professions and roles",
    hint: "One role catalog for Activities, Profile and future role-specific reputation.",
    catalog: "Available roles",
    pending: "Interest level selection and persistence will follow the approved role-interest model.",
  },
};

export function ProfileRolesSection({ language }: { language: Language }) {
  const text = copy[language];
  const roles = buildProfileRoleCatalogViewModel(language);

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
        <div className="profile-role-catalog-grid">
          {roles.map((role) => (
            <span className="profile-role-chip" data-profile-role-id={role.id} key={role.id}>
              {role.label}
            </span>
          ))}
        </div>
        <small className="profile-role-catalog-note">{text.pending}</small>
      </div>
    </details>
  );
}
