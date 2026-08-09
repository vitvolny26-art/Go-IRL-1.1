import { useEffect, useMemo, useState } from "react";
import { submitAccountRequest, type AccountRequestKind, type AccountRequestResult } from "../accountRequest";
import { createAccountRequestTransport } from "../accountRequestTransport";
import { getCurrentAuthIdentity } from "../authSession";
import { getCity } from "../config/cities";
import { createProfileRepository } from "../profile/profileRepository";
import type { UserProfile } from "../profile/profileTypes";
import { getUserKey, supabase } from "../supabase";
import type { Language } from "../types";
import { useAppStore } from "../store";
import { ProfilePrivacyCenter } from "./ProfilePrivacyCenter";

export function OwnedProfilePrivacySection({ language }: { language: Language }) {
  const selectedCityId = useAppStore((state) => state.selectedCityId);
  const identity = getCurrentAuthIdentity();
  const identityKey = identity?.source === "trusted-telegram" ? identity.user.userKey : getUserKey();
  const repository = useMemo(() => createProfileRepository({
    identity,
    supabaseClient: supabase,
    storage: localStorage,
    fallbackDisplayName: "GO IRL User",
    fallbackCityId: selectedCityId,
  }), [identityKey, selectedCityId]);
  const accountRequestTransport = useMemo(() => createAccountRequestTransport(), []);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [avatar, setAvatar] = useState("GI");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [accountRequestPending, setAccountRequestPending] = useState<AccountRequestKind | null>(null);
  const [accountRequestResult, setAccountRequestResult] = useState<AccountRequestResult | null>(null);

  useEffect(() => {
    let active = true;
    setError("");
    void repository.loadOwnProfile().then(async (loaded) => {
      if (!active || !loaded) return;
      const resolvedAvatar = loaded.avatarPath
        ? await repository.resolveAvatarUrl(loaded.avatarPath).catch(() => loaded.avatarCode || "GI")
        : loaded.avatarCode || "GI";
      if (!active) return;
      setProfile(loaded);
      setAvatar(resolvedAvatar);
    }).catch(() => { if (active) setError("profile_load_failed"); });
    return () => { active = false; };
  }, [repository]);

  if (!profile) return <div className="profile-skeleton" aria-busy="true"><span /><span /><span /></div>;

  const saveVisibility = async ({ isPublic, showFavorites }: { isPublic: boolean; showFavorites: boolean }) => {
    setSaving(true);
    setError("");
    try {
      const saved = await repository.saveOwnProfile({
        displayName: profile.displayName,
        bio: profile.bio,
        cityId: profile.cityId,
        avatarPath: profile.avatarPath,
        avatarCode: profile.avatarCode,
        isPublic,
        showFavorites: isPublic ? showFavorites : false,
        favoriteActivityIds: profile.favoriteActivityIds,
      });
      setProfile(saved);
    } catch {
      setError("profile_save_failed");
    } finally {
      setSaving(false);
    }
  };

  const requestAccountAction = async (kind: AccountRequestKind) => {
    if (accountRequestPending) return;
    setAccountRequestPending(kind);
    setAccountRequestResult(null);
    try {
      setAccountRequestResult(await submitAccountRequest(kind, { transport: accountRequestTransport }));
    } finally {
      setAccountRequestPending(null);
    }
  };

  return (
    <>
      {error ? <div className="details-error profile-error" role="alert">Не удалось синхронизировать настройки приватности</div> : null}
      <ProfilePrivacyCenter
        language={language}
        saving={saving}
        accountRequestPending={accountRequestPending}
        accountRequestResult={accountRequestResult}
        onAccountRequest={(kind) => { void requestAccountAction(kind); }}
        onChange={(next) => { void saveVisibility(next); }}
        snapshot={{
          displayName: profile.displayName,
          bio: profile.bio,
          cityLabel: getCity(profile.cityId).name[language],
          avatar,
          isPublic: profile.isPublic,
          showFavorites: profile.showFavorites,
          favoriteLabels: profile.favoriteActivityIds,
        }}
      />
    </>
  );
}
