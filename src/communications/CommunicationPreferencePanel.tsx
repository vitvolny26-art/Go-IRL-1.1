import { useEffect, useState } from "react";
import type { Language } from "../types.js";
import type { CommunicationChannel, CommunicationRoute } from "./contracts.js";
import { loadCommunicationSettings, saveCommunicationPreference } from "./repository.js";
import "./communication-preferences.css";

type Props = { language: Language; required?: boolean; onComplete?: () => void };
const labels: Record<Language, Record<CommunicationChannel, string>> = {
  ru: { in_app: "В GO IRL", email: "Email", telegram: "Telegram", messenger: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp" },
  uk: { in_app: "У GO IRL", email: "Email", telegram: "Telegram", messenger: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp" },
  cs: { in_app: "V GO IRL", email: "E-mail", telegram: "Telegram", messenger: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp" },
  en: { in_app: "In GO IRL", email: "Email", telegram: "Telegram", messenger: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp" },
};
const copy = {
  ru: { title: "Как с вами связываться?", hint: "Выберите основной канал. Связанный аккаунт не считается готовым каналом без разрешения и проверки.", loading: "Загружаем каналы…", save: "Сохранить канал", saving: "Сохраняем…", saved: "Канал сохранён", unavailable: "Недоступно", verify: "Нужна проверка", reconnect: "Нужно переподключить", manage: "Подключить или проверить", failed: "Не удалось сохранить. Попробуйте позже.", none: "Нет доступных каналов. Внутренний канал GO IRL должен быть подключён администратором." },
  uk: { title: "Як з вами зв’язуватися?", hint: "Оберіть основний канал. Пов’язаний акаунт не є готовим каналом без дозволу та перевірки.", loading: "Завантажуємо канали…", save: "Зберегти канал", saving: "Зберігаємо…", saved: "Канал збережено", unavailable: "Недоступно", verify: "Потрібна перевірка", reconnect: "Потрібно підключити знову", manage: "Підключити або перевірити", failed: "Не вдалося зберегти. Спробуйте пізніше.", none: "Немає доступних каналів. Внутрішній канал GO IRL має підключити адміністратор." },
  cs: { title: "Jak vás máme kontaktovat?", hint: "Vyberte hlavní kanál. Propojený účet není připravený kanál bez oprávnění a ověření.", loading: "Načítáme kanály…", save: "Uložit kanál", saving: "Ukládám…", saved: "Kanál byl uložen", unavailable: "Nedostupné", verify: "Vyžaduje ověření", reconnect: "Je třeba znovu připojit", manage: "Připojit nebo ověřit", failed: "Uložení se nezdařilo. Zkuste to později.", none: "Nejsou dostupné žádné kanály. Interní kanál GO IRL musí připojit správce." },
  en: { title: "How should we contact you?", hint: "Choose your primary channel. A linked account is not message-ready without permission and verification.", loading: "Loading channels…", save: "Save channel", saving: "Saving…", saved: "Channel saved", unavailable: "Unavailable", verify: "Verification required", reconnect: "Reconnect required", manage: "Connect or verify", failed: "Could not save. Try again later.", none: "No channels are available. An administrator must enable the GO IRL in-app route." },
} satisfies Record<Language, Record<string, string>>;

const routeStatus = (route: CommunicationRoute, text: typeof copy.en) => {
  if (route.readiness === "revoked" || route.readiness === "disabled") return text.reconnect;
  if (route.readiness !== "ready" || route.consent !== "granted" || !route.capabilities.includes("outbound") || !route.capabilities.includes("notification")) return text.verify;
  if (route.health === "degraded" || route.health === "unhealthy") return text.reconnect;
  return "";
};
export function CommunicationPreferencePanel({ language, required = false, onComplete }: Props) {
  const text = copy[language];
  const [routes, setRoutes] = useState<CommunicationRoute[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");

  useEffect(() => {
    let active = true;
    void loadCommunicationSettings().then((settings) => {
      if (!active) return;
      setRoutes(settings.routes);
      setSelected(settings.preference.primaryRouteId);
      setState("ready");
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);

  const save = async () => {
    if (required && !selected) return;
    setState("saving");
    try {
      await saveCommunicationPreference(selected);
      setState("saved");
      onComplete?.();
    } catch { setState("error"); }
  };

  return <section className="communication-preference-panel" aria-live="polite">
    <h2>{text.title}</h2><p>{text.hint}</p>
    {state === "loading" ? <p>{text.loading}</p> : <div className="communication-route-list">
      {routes.length ? routes.map((route) => {
        const status = routeStatus(route, text);
        return <label key={route.id} className={`communication-route${status ? " is-unavailable" : ""}`}>
          <input type="radio" name="communication-route" value={route.id} checked={selected === route.id} disabled={Boolean(status)} onChange={() => { setSelected(route.id); setState("ready"); }} />
          <span><strong>{labels[language][route.channel]}</strong>{status ? <small>{status}</small> : null}</span>
          {status && route.channel !== "in_app" ? <button type="button" className="beauty-secondary" onClick={(event) => { event.preventDefault(); window.location.assign("/profile/security"); }}>{text.manage}</button> : null}
        </label>;
      }) : <p>{text.none}</p>}
    </div>}
    {state === "saved" ? <div className="beauty-success"><span>{text.saved}</span></div> : null}
    {state === "error" ? <div className="beauty-errors"><span>{text.failed}</span></div> : null}
    <button className="beauty-primary" type="button" disabled={state === "loading" || state === "saving" || (required && !selected)} onClick={() => void save()}>{state === "saving" ? text.saving : text.save}</button>
  </section>;
}
