import {
  getProfileRoleLabel,
  profileRoleCatalog,
  type ProfileRoleId,
  type ProfileRoleLocale,
} from "./profileRoleCatalog";

export type ProfileRoleViewModel = Readonly<{
  id: ProfileRoleId;
  label: string;
}>;

export const buildProfileRoleCatalogViewModel = (
  locale: ProfileRoleLocale,
): readonly ProfileRoleViewModel[] =>
  profileRoleCatalog.map((role) => ({
    id: role.id,
    label: getProfileRoleLabel(role.id, locale),
  }));
