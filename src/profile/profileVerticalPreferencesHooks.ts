import { useEffect, useState } from "react";
import {
  profileVerticalPreferencesChangedEvent,
  profileVerticalPreferencesStorageKeyForUser,
  readProfileVerticalPreferences,
  readServicesClientPreferences,
  type ProfilePreferenceStorage,
  type ProfileVerticalPreferences,
} from "./profileVerticalPreferences";

type AccountScopedPreferenceReader<T> = (storage: ProfilePreferenceStorage, userKey: string) => T;

const useAccountScopedPreferenceState = <T,>(
  userKey: string,
  read: AccountScopedPreferenceReader<T>,
  empty: () => T,
): T => {
  const [state, setState] = useState<T>(() => (
    typeof window === "undefined" ? empty() : read(window.localStorage, userKey)
  ));

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const sync = () => setState(read(window.localStorage, userKey));
    const storageKey = profileVerticalPreferencesStorageKeyForUser(userKey);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) sync();
    };
    const handleInternal = (event: Event) => {
      const detail = (event as CustomEvent<{ userKey?: string }>).detail;
      if (detail?.userKey === userKey) sync();
    };

    sync();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(profileVerticalPreferencesChangedEvent, handleInternal);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(profileVerticalPreferencesChangedEvent, handleInternal);
    };
  }, [empty, read, userKey]);

  return state;
};

const emptyVerticalPreferences = (): ProfileVerticalPreferences => ({ services: [] });
const emptyServicesClientPreferences = (): string[] => [];

export const useProfileVerticalPreferences = (userKey: string) =>
  useAccountScopedPreferenceState(userKey, readProfileVerticalPreferences, emptyVerticalPreferences);

export const useServicesClientPreferences = (userKey: string) =>
  useAccountScopedPreferenceState(userKey, readServicesClientPreferences, emptyServicesClientPreferences);
