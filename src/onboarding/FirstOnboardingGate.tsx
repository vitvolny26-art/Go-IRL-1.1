import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  getCurrentAuthIdentity,
  getCurrentDisplayName,
  initializeTrustedAuth,
} from "../authSession";
import { defaultCityId } from "../config/cities";
import { createProfileRepository } from "../profile/profileRepository";
import type { UserProfile } from "../profile/profileTypes";
import { supabase } from "../supabase";
import { supportsTrustedCoreAccess } from "../auth/trustedCoreAccess";
import { useAppStore } from "../store";
import {
  completeFirstOnboarding,
  firstOnboardingPrivacyVersion,
  firstOnboardingRequiredEvent,
  firstOnboardingTermsVersion,
  loadFirstOnboardingState,
  normalizeFirstOnboardingNickname,
  validateFirstOnboardingNickname,
} from "./firstOnboarding";

const emptyChecks = { adult: false, terms: false, privacy: false };

export function FirstOnboardingGate() {
  const selectedCityId = useAppStore((state) => state.selectedCityId);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [nickname, setNickname] = useState("");
  const [checks, setChecks] = useState(emptyChecks);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const profileRepository = useMemo(() => {
    const identity = getCurrentAuthIdentity();
    if (!supportsTrustedCoreAccess(identity)) return null;
    return createProfileRepository({
      identity,
      supabaseClient: supabase,
      storage: window.localStorage,
      fallbackDisplayName: getCurrentDisplayName("GO IRL User"),
      fallbackCityId: selectedCityId || defaultCityId,
    });
  }, [selectedCityId, open]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      setLoading(true);
      try {
        const identity = await initializeTrustedAuth();
        if (!supportsTrustedCoreAccess(identity) || !identity || (identity.source !== "trusted-telegram" && identity.source !== "trusted-provider")) return;
        const state = await loadFirstOnboardingState();
        if (cancelled || state.completed) return;

        const repository = createProfileRepository({
          identity,
          supabaseClient: supabase,
          storage: window.localStorage,
          fallbackDisplayName: getCurrentDisplayName("GO IRL User"),
          fallbackCityId: selectedCityId || defaultCityId,
        });
        const existingProfile = await repository.loadOwnProfile();
        if (cancelled) return;
        setProfile(existingProfile);
        setDisplayName(existingProfile?.displayName || getCurrentDisplayName("GO IRL User"));
        setNickname(identity.user.username ? normalizeFirstOnboardingNickname(identity.user.username) : "");
        setOpen(true);
      } catch {
        // Auth or TEST/backend unavailability must not hide the public event surface.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void initialize();
    return () => { cancelled = true; };
  }, [selectedCityId]);

  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener(firstOnboardingRequiredEvent, reopen);
    return () => window.removeEventListener(firstOnboardingRequiredEvent, reopen);
  }, []);

  if (loading || !open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;

    const trimmedDisplayName = displayName.trim();
    const normalizedNickname = normalizeFirstOnboardingNickname(nickname);
    const nicknameError = validateFirstOnboardingNickname(normalizedNickname);
    if (trimmedDisplayName.length < 2 || trimmedDisplayName.length > 40) {
      setError("Display name must be 2–40 characters.");
      return;
    }
    if (nicknameError) {
      setError(nicknameError === "reserved_nickname" ? "This username is reserved." : "Use 3–24 lowercase letters, numbers, or single underscores.");
      return;
    }
    if (!checks.adult || !checks.terms || !checks.privacy) {
      setError("Confirm 18+, Terms, and Privacy to continue.");
      return;
    }
    if (!profileRepository) {
      setError("Trusted authentication is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Persist the editable name first. If activation fails (for example nickname conflict),
      // the user remains activation-gated and can retry without losing the chosen name.
      await profileRepository.saveOwnProfile({
        displayName: trimmedDisplayName,
        bio: profile?.bio || "",
        cityId: profile?.cityId || selectedCityId || defaultCityId,
        avatarPath: profile?.avatarPath || null,
        avatarCode: profile?.avatarCode || null,
        isPublic: profile?.isPublic ?? true,
        showFavorites: profile?.showFavorites ?? true,
        favoriteActivityIds: profile?.favoriteActivityIds || [],
      });

      await completeFirstOnboarding({
        nickname: normalizedNickname,
        is18OrOlder: checks.adult,
        acceptedTerms: checks.terms,
        acceptedPrivacy: checks.privacy,
      });

      setOpen(false);
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : "onboarding_failed";
      setError(message.includes("duplicate") || message.includes("unique")
        ? "That username is already taken."
        : "Could not complete onboarding. Please review the fields and retry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="first-onboarding-backdrop" role="presentation">
      <section className="first-onboarding-card" role="dialog" aria-modal="true" aria-labelledby="first-onboarding-title">
        <button className="first-onboarding-close" type="button" onClick={() => setOpen(false)} aria-label="Return to public event">×</button>
        <p className="first-onboarding-kicker">GO IRL</p>
        <h1 id="first-onboarding-title">Finish your profile</h1>
        <p className="first-onboarding-copy">One screen, then you can create, join, request, and chat. Closing this keeps the public event view available.</p>

        <form onSubmit={submit} className="first-onboarding-form">
          <label>
            <span>Name</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} autoComplete="name" />
          </label>
          <label>
            <span>Username</span>
            <input value={nickname} onChange={(event) => setNickname(event.target.value.toLowerCase())} maxLength={24} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="vit_user" />
          </label>

          <label className="first-onboarding-check">
            <input type="checkbox" checked={checks.adult} onChange={(event) => setChecks((value) => ({ ...value, adult: event.target.checked }))} />
            <span>I confirm I am 18 or older.</span>
          </label>
          <label className="first-onboarding-check">
            <input type="checkbox" checked={checks.terms} onChange={(event) => setChecks((value) => ({ ...value, terms: event.target.checked }))} />
            <span>I accept the <a href="/terms.html" target="_blank" rel="noreferrer">Terms</a> ({firstOnboardingTermsVersion}).</span>
          </label>
          <label className="first-onboarding-check">
            <input type="checkbox" checked={checks.privacy} onChange={(event) => setChecks((value) => ({ ...value, privacy: event.target.checked }))} />
            <span>I accept the <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> ({firstOnboardingPrivacyVersion}).</span>
          </label>

          {error ? <p className="first-onboarding-error" role="alert">{error}</p> : null}
          <button className="first-onboarding-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Continue"}</button>
          <button className="first-onboarding-secondary" type="button" onClick={() => setOpen(false)}>Back to public event</button>
        </form>
      </section>
    </div>
  );
}
