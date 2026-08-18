import { useEffect, useState } from "react";
import type { Language } from "../types";
import {
  loadBookingConfirmationMode,
  saveBookingConfirmationMode,
  type BookingConfirmationMode,
  type BookingConfirmationModeSource,
} from "../services/servicesBookingConfirmationModeRepository";

const copy = {
  ru: { title: "Подтверждение записи", hint: "Автоматически подтверждать свободный слот или сначала отправлять запрос мастеру.", manual: "Вручную", automatic: "Автоматически", unavailable: "Настройка доступна только при серверной синхронизации.", error: "Не удалось сохранить режим подтверждения." },
  uk: { title: "Підтвердження запису", hint: "Автоматично підтверджувати вільний слот або спочатку надсилати запит майстру.", manual: "Вручну", automatic: "Автоматично", unavailable: "Налаштування доступне лише за серверної синхронізації.", error: "Не вдалося зберегти режим підтвердження." },
  cs: { title: "Potvrzení rezervace", hint: "Volný termín potvrdit automaticky, nebo nejprve poslat žádost profesionálovi.", manual: "Ručně", automatic: "Automaticky", unavailable: "Nastavení je dostupné pouze při serverové synchronizaci.", error: "Režim potvrzení se nepodařilo uložit." },
  en: { title: "Booking confirmation", hint: "Confirm an available slot automatically or send a request to the professional first.", manual: "Manual", automatic: "Automatic", unavailable: "This setting is available only with server synchronization.", error: "Could not save the confirmation mode." },
} satisfies Record<Language, Record<string, string>>;

export function BeautyBookingConfirmationModeControl({ language }: { language: Language }) {
  const text = copy[language];
  const [mode, setMode] = useState<BookingConfirmationMode>("manual");
  const [source, setSource] = useState<BookingConfirmationModeSource>("local-fallback");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void loadBookingConfirmationMode()
      .then((snapshot) => {
        if (!active) return;
        setMode(snapshot.mode);
        setSource(snapshot.source);
      })
      .catch(() => { if (active) setError(text.error); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [text.error]);

  const changeMode = async (nextMode: BookingConfirmationMode) => {
    if (saving || source !== "server" || nextMode === mode) return;
    setSaving(true);
    setError("");
    try {
      const snapshot = await saveBookingConfirmationMode(nextMode);
      setMode(snapshot.mode);
      setSource(snapshot.source);
      if (snapshot.source !== "server") setError(text.unavailable);
    } catch {
      setError(text.error);
    } finally {
      setSaving(false);
    }
  };

  return <section className="beauty-workspace-subsection" aria-busy={loading || saving}>
    <div className="beauty-workspace-subsection-head"><div><h3>{text.title}</h3><p>{text.hint}</p></div></div>
    <div className="beauty-workspace-head-actions" role="group" aria-label={text.title}>
      <button className={mode === "manual" ? "beauty-primary" : "beauty-secondary"} type="button" disabled={loading || saving || source !== "server"} onClick={() => { void changeMode("manual"); }}>{text.manual}</button>
      <button className={mode === "automatic" ? "beauty-primary" : "beauty-secondary"} type="button" disabled={loading || saving || source !== "server"} onClick={() => { void changeMode("automatic"); }}>{text.automatic}</button>
    </div>
    {!loading && source !== "server" && <div className="beauty-note"><span>{text.unavailable}</span></div>}
    {error && <div className="beauty-errors"><span>{error}</span></div>}
  </section>;
}
