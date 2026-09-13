import { useEffect, useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { getCurrentAuthIdentity, readAuthUserKey } from "../authSession";
import { createOrganizerFavoritesRepository } from "../favorites/organizerFavoritesRepository";
import { buildOrganizerTrustSummary, type OrganizerTrustProjection } from "../profile/organizerTrustProjection";
import { loadOrganizerTrustProjectionMap } from "../profile/organizerTrustProjectionRepository";
import { resolveOrganizerIdentity, type OrganizerIdentity } from "../profile/organizerIdentityResolver";
import { useAppStore } from "../store";
import { supabase } from "../supabase";
import type { Language } from "../types";
import { isOrganizerAvatarImage, organizerProfileEventName, type OrganizerProfileDetail } from "./EventCardPrimitives";

type FavoriteOrganizerItem = {
  identity: OrganizerIdentity;
  trust: OrganizerTrustProjection | null;
};

const copy: Record<Language, { title: string; empty: string }> = {
  ru: { title: "Избранные организаторы", empty: "Пока нет избранных организаторов" },
  uk: { title: "Обрані організатори", empty: "Поки немає обраних організаторів" },
  cs: { title: "Oblíbení organizátoři", empty: "Zatím nemáte oblíbené organizátory" },
  en: { title: "Favorite organizers", empty: "No favorite organizers yet" },
};

const trustedUserKey = () => {
  const identity = getCurrentAuthIdentity();
  return identity?.source === "trusted-telegram" || identity?.source === "trusted-provider"
    ? readAuthUserKey(identity)
    : null;
};

export function FavoriteOrganizersSection({ language }: { language: Language }) {
  const activities = useAppStore((state) => state.activities);
  const [items, setItems] = useState<FavoriteOrganizerItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const fallbackNames = useMemo(() => {
    const names = new Map<string, string>();
    activities.forEach((activity) => {
      if (activity.organizerKey && !names.has(activity.organizerKey)) names.set(activity.organizerKey, activity.organizer);
    });
    return names;
  }, [activities]);

  useEffect(() => {
    let active = true;
    const userKey = trustedUserKey();
    if (!userKey) {
      setItems([]);
      setLoaded(true);
      return () => { active = false; };
    }

    setLoaded(false);
    void (async () => {
      try {
        const favorites = await createOrganizerFavoritesRepository(supabase, userKey).loadActive();
        const organizerKeys = favorites.map((favorite) => favorite.organizerUserKey);
        const [trustByOrganizer, identities] = await Promise.all([
          loadOrganizerTrustProjectionMap(organizerKeys),
          Promise.all(organizerKeys.map((organizerKey) => resolveOrganizerIdentity(
            organizerKey,
            fallbackNames.get(organizerKey) || "GO IRL Organizer",
          ))),
        ]);
        if (!active) return;
        setItems(identities.map((identity) => ({
          identity,
          trust: trustByOrganizer.get(identity.organizerKey) || null,
        })));
      } catch {
        if (active) setItems([]);
      } finally {
        if (active) setLoaded(true);
      }
    })();

    return () => { active = false; };
  }, [fallbackNames]);

  const labels = copy[language];
  return (
    <section className="profile-favorite-organizers" aria-labelledby="profile-favorite-organizers-title">
      <h3 id="profile-favorite-organizers-title"><Heart aria-hidden="true" />{labels.title}</h3>
      {items.length ? <div className="profile-favorite-organizer-list">
        {items.map(({ identity, trust }) => (
          <button
            key={identity.organizerKey}
            type="button"
            className="profile-favorite-organizer-card"
            onClick={() => window.dispatchEvent(new CustomEvent<OrganizerProfileDetail>(organizerProfileEventName, { detail: identity }))}
          >
            <span className="profile-favorite-organizer-avatar">{isOrganizerAvatarImage(identity.avatar) ? <img src={identity.avatar} alt="" /> : identity.avatar}</span>
            <span className="profile-favorite-organizer-copy">
              <strong>{identity.displayName}</strong>
              {trust ? <small>{buildOrganizerTrustSummary(trust, language)}</small> : null}
            </span>
          </button>
        ))}
      </div> : loaded ? <p className="profile-favorite-organizers-empty">{labels.empty}</p> : null}
    </section>
  );
}
