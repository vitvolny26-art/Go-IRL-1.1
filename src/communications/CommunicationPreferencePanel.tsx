import { useEffect, useMemo, useState } from "react";
import type { Language } from "../types.js";
import type {
  CommunicationChannel,
  CommunicationPreferenceSelectionSource,
  CommunicationRoute,
} from "./contracts.js";
import {
  loadCommunicationSettings,
  requestTelegramCommunicationVerification,
  saveCommunicationPreference,
} from "./repository.js";
import "./communication-preferences.css";

type Props = {
  language: Language;
  required?: boolean;
  audience?: "master" | "user";
  onComplete?: () => void;
  selectionSource?: Exclude<CommunicationPreferenceSelectionSource, "system_default">;
  allowedChannels?: CommunicationChannel[];
};

const labels: Record<Language, Record<CommunicationChannel, string>> = {
  ru: { in_app: "Пуши в GO IRL", email: "Email", telegram: "Telegram", messenger: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp" },
  uk: { in_app: "Сповіщення в GO IRL", email: "Email", telegram: "Telegram", messenger: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp" },
  cs: { in_app: "Oznámení v GO IRL", email: "E-mail", telegram: "Telegram", messenger: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp" },
  en: { in_app: "GO IRL notifications", email: "Email", telegram: "Telegram", messenger: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp" },
  pl: { in_app: "GO IRL notifications", email: "Email", telegram: "Telegram", messenger: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp" },
  sk: { in_app: "Oznámení v GO IRL", email: "E-mail", telegram: "Telegram", messenger: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp" },
};

const copy = {
  ru: { title: "Как с вами связываться?", hint: "Выберите основной канал. Связанный аккаунт не считается готовым каналом без разрешения и проверки.", loading: "Загружаем каналы…", save: "Сохранить канал", saving: "Сохраняем…", saved: "Канал сохранён", unavailable: "Недоступно", verify: "Нужна проверка", reconnect: "Нужно переподключить", manage: "Подтвердить Telegram", verifying: "Отправляем проверку…", verificationSent: "Проверка отправлена в Telegram", failed: "Не удалось сохранить. Попробуйте позже.", none: "Нет доступных каналов. Внутренний канал GO IRL должен быть подключён администратором." },
  uk: { title: "Як з вами зв’язуватися?", hint: "Оберіть основний канал. Пов’язаний акаунт не є готовим каналом без дозволу та перевірки.", loading: "Завантажуємо канали…", save: "Зберегти канал", saving: "Зберігаємо…", saved: "Канал збережено", unavailable: "Недоступно", verify: "Потрібна перевірка", reconnect: "Потрібно підключити знову", manage: "Підтвердити Telegram", verifying: "Надсилаємо перевірку…", verificationSent: "Перевірку надіслано в Telegram", failed: "Не вдалося зберегти. Спробуйте пізніше.", none: "Немає доступних каналів. Внутрішній канал GO IRL має підключити адміністратор." },
  cs: { title: "Jak vás máme kontaktovat?", hint: "Vyberte hlavní kanál. Propojený účet není připravený kanál bez oprávnění a ověření.", loading: "Načítáme kanály…", save: "Uložit kanál", saving: "Ukládám…", saved: "Kanál byl uložen", unavailable: "Nedostupné", verify: "Vyžaduje ověření", reconnect: "Je třeba znovu připojit", manage: "Ověřit Telegram", verifying: "Odesíláme ověření…", verificationSent: "Ověření bylo odesláno do Telegramu", failed: "Uložení se nezdařilo. Zkuste to později.", none: "Nejsou dostupné žádné kanály. Interní kanál GO IRL musí připojit správce." },
  en: { title: "How should we contact you?", hint: "Choose your primary channel. A linked account is not message-ready without permission and verification.", loading: "Loading channels…", save: "Save channel", saving: "Saving…", saved: "Channel saved", unavailable: "Unavailable", verify: "Verification required", reconnect: "Reconnect required", manage: "Verify Telegram", verifying: "Sending verification…", verificationSent: "Verification sent in Telegram", failed: "Could not save. Try again later.", none: "No channels are available. An administrator must enable the GO IRL in-app route." },
  pl: { title: "How should we contact you?", hint: "Choose your primary channel. A linked account is not message-ready without permission and verification.", loading: "Loading channels…", save: "Save channel", saving: "Saving…", saved: "Channel saved", unavailable: "Unavailable", verify: "Verification required", reconnect: "Reconnect required", manage: "Verify Telegram", verifying: "Sending verification…", verificationSent: "Verification sent in Telegram", failed: "Could not save. Try again later.", none: "No channels are available. An administrator must enable the GO IRL in-app route." },
  sk: { title: "Jak vás máme kontaktovat?", hint: "Vyberte hlavní kanál. Propojený účet není připravený kanál bez oprávnění a ověření.", loading: "Načítáme kanály…", save: "Uložit kanál", saving: "Ukládám…", saved: "Kanál byl uložen", unavailable: "Nedostupné", verify: "Vyžaduje ověření", reconnect: "Je třeba znovu připojit", manage: "Ověřit Telegram", verifying: "Odesíláme ověření…", verificationSent: "Ověření bylo odesláno do Telegramu", failed: "Uložení se nezdařilo. Zkuste to později.", none: "Nejsou dostupné žádné kanály. Interní kanál GO IRL musí připojit správce." },
} satisfies Record<Language, Record<string, string>>;

const userCopy = {
  ru: { ...copy.ru, title: "Канал для оповещений", hint: "Выберите Telegram или пуши в GO IRL. Telegram можно выбрать сразу, но для доставки его нужно подтвердить." },
  uk: { ...copy.uk, title: "Канал для сповіщень", hint: "Оберіть Telegram або сповіщення в GO IRL. Telegram можна вибрати одразу, але для доставки його потрібно підтвердити." },
  cs: { ...copy.cs, title: "Kanál pro oznámení", hint: "Vyberte Telegram nebo oznámení v GO IRL. Telegram lze zvolit hned, ale pro doručování je nutné ho ověřit." },
  en: { ...copy.en, title: "Notification channel", hint: "Choose Telegram or GO IRL notifications. You can select Telegram immediately, but it must be verified before delivery." },
  pl: { ...copy.en, title: "Notification channel", hint: "Choose Telegram or GO IRL notifications. You can select Telegram immediately, but it must be verified before delivery." },
  sk: { ...copy.cs, title: "Kanál pro oznámení", hint: "Vyberte Telegram nebo oznámení v GO IRL. Telegram lze zvolit hned, ale pro doručování je nutné ho ověřit." },
} satisfies Record<Language, Record<string, string>>;

const routeStatus = (route: CommunicationRoute, text: typeof copy.en) => {
  if (route.readiness === "revoked" || route.readiness === "disabled") return text.reconnect;
  if (route.readiness !== "ready" || route.consent !== "granted" || !route.capabilities.includes("outbound") || !route.capabilities.includes("notification")) return text.verify;
  if (route.health === "degraded" || route.health === "unhealthy") return text.reconnect;
  return "";
};

const canSelectRoute = (route: CommunicationRoute, status: string) => {
  if (!status) return true;
  return route.channel === "telegram"
    && route.readiness !== "disabled"
    && route.readiness !== "revoked"
    && route.consent !== "denied"
    && route.consent !== "revoked";
};

export function CommunicationPreferencePanel({
  language,
  required = false,
  audience = "master",
  onComplete,
  selectionSource = "settings",
  allowedChannels,
}: Props) {
  const text = (audience === "user" ? userCopy : copy)[language];
  const [routes, setRoutes] = useState<CommunicationRoute[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "verifying" | "saved" | "verification-sent" | "error">("loading");

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

  const visibleRoutes = useMemo(
    () => allowedChannels?.length ? routes.filter((route) => allowedChannels.includes(route.channel)) : routes,
    [allowedChannels, routes],
  );

  const requestVerification = async () => {
    setState("verifying");
    try {
      await requestTelegramCommunicationVerification();
      setState("verification-sent");
      return true;
    } catch {
      setState("error");
      return false;
    }
  };

  const save = async () => {
    if (required && !selected) return;
    const selectedRoute = routes.find((route) => route.id === selected) || null;
    setState("saving");
    try {
      if (selectedRoute?.channel === "telegram" && routeStatus(selectedRoute, text)) {
        if (!await requestVerification()) return;
      }
      await saveCommunicationPreference(selected, selectionSource);
      setState(selectedRoute?.channel === "telegram" && routeStatus(selectedRoute, text) ? "verification-sent" : "saved");
      onComplete?.();
    } catch {
      setState("error");
    }
  };

  return <section className="communication-preference-panel" aria-live="polite">
    <h2>{text.title}</h2><p>{text.hint}</p>
    {state === "loading" ? <p>{text.loading}</p> : <div className="communication-route-list">
      {visibleRoutes.length ? visibleRoutes.map((route) => {
        const status = routeStatus(route, text);
        const selectable = canSelectRoute(route, status);
        return <label key={route.id} className={`communication-route${status ? " is-unavailable" : ""}`}>
          <input type="radio" name="communication-route" value={route.id} checked={selected === route.id} disabled={!selectable} onChange={() => { setSelected(route.id); setState("ready"); }} />
          <span><strong>{labels[language][route.channel]}</strong>{status ? <small>{status}</small> : null}</span>
          {status && route.channel === "telegram" && selectable ? <button type="button" className="beauty-secondary" disabled={state === "verifying"} onClick={(event) => { event.preventDefault(); void requestVerification(); }}>{state === "verifying" ? text.verifying : text.manage}</button> : null}
        </label>;
      }) : <p>{text.none}</p>}
    </div>}
    {state === "saved" ? <div className="beauty-success"><span>{text.saved}</span></div> : null}
    {state === "verification-sent" ? <div className="beauty-success"><span>{text.verificationSent}</span></div> : null}
    {state === "error" ? <div className="beauty-errors"><span>{text.failed}</span></div> : null}
    <button className="beauty-primary" type="button" disabled={state === "loading" || state === "saving" || state === "verifying" || (required && !selected)} onClick={() => void save()}>{state === "saving" ? text.saving : text.save}</button>
  </section>;
}
