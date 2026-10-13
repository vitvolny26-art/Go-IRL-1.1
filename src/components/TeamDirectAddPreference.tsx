import { useEffect, useState } from "react";
import { trustedAuthSessionChangedEvent } from "../authSession";
import { getNamedTeamsActorUserKey } from "../people/namedTeamsActor";
import { supabase } from "../supabase";
import type { Language } from "../types";

const copy: Record<Language, { label: string; hint: string; error: string; loading: string }> = {
  ru: { label: "Запретить добавлять меня в команды без подтверждения", hint: "Если включено, владельцы и администраторы не смогут добавить вас напрямую.", error: "Не удалось сохранить настройку", loading: "Загрузка настройки…" },
  uk: { label: "Заборонити додавати мене до команд без підтвердження", hint: "Власники та адміністратори не зможуть додати вас напряму.", error: "Не вдалося зберегти налаштування", loading: "Завантаження налаштування…" },
  en: { label: "Block adding me to teams without confirmation", hint: "Team owners and admins cannot add you directly when enabled.", error: "Could not save setting", loading: "Loading setting…" },
  cs: { label: "Zakázat přidání do týmů bez potvrzení", hint: "Vlastníci a správci vás nebudou moci přidat přímo.", error: "Nastavení nelze uložit", loading: "Načítání nastavení…" },
  pl: { label: "Blokuj dodawanie mnie do zespołów bez potwierdzenia", hint: "Właściciele i administratorzy nie mogą dodać Cię bezpośrednio.", error: "Nie udało się zapisać ustawienia", loading: "Ładowanie ustawienia…" },
  sk: { label: "Zakázať pridanie do tímov bez potvrdenia", hint: "Vlastníci a správcovia vás nebudú môcť pridať priamo.", error: "Nastavenie sa nepodarilo uložiť", loading: "Načítava sa nastavenie…" },
};
export function TeamDirectAddPreference({ language }: { language: Language }) {
  const [actor, setActor] = useState(getNamedTeamsActorUserKey);
  const [blocked, setBlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const refresh = () => setActor(getNamedTeamsActorUserKey());
    window.addEventListener(trustedAuthSessionChangedEvent, refresh);
    return () => window.removeEventListener(trustedAuthSessionChangedEvent, refresh);
  }, []);
  useEffect(() => {
    setReady(false); setError(false);
    if (!actor) return;
    let active = true;
    void supabase.rpc("go_irl_named_team_join_preference", { p_block: null })
      .then(({ data, error: rpcError }) => {
        if (!active) return;
        if (rpcError) { setError(true); return; }
        setBlocked(data === true); setReady(true);
      });
    return () => { active = false; };
  }, [actor]);
  const labels = copy[language];
  if (!actor) return null;
  return <div className="profile-privacy-toggle">
    <span aria-hidden="true">☑</span>
    <span><strong>{labels.label}</strong><small>{labels.hint}</small></span>
    <input type="checkbox" aria-label={labels.label} checked={blocked} disabled={!ready || busy}
      onChange={(event) => {
        const next = event.target.checked;
        setBusy(true); setError(false);
        void supabase.rpc("go_irl_named_team_join_preference", { p_block: next })
          .then(({ data, error: rpcError }) => {
            if (rpcError) { setError(true); } else { setBlocked(data === true); }
            setBusy(false);
          });
      }} />
    {!ready && !error && <small role="status">{labels.loading}</small>}
    {error && <small role="alert">{labels.error}</small>}
  </div>;
}
