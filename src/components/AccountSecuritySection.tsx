import { useEffect, useMemo, useState } from "react";
import { Link2, ShieldCheck } from "lucide-react";
import {
  canLinkProvider,
  consumeAccountSecurityFeedback,
  fetchLinkedProviderIdentities,
  type AccountSecurityFeedback,
  type LinkedProviderIdentity,
} from "../auth/accountSecurity";
import { beginWebAuth, isWebAuthProviderEnabled } from "../auth/googleWebAuth";
import { getCurrentAuthSession } from "../authSession";
import type { WebTrustedIdentityProvider } from "../auth/providerTrustedSession";
import type { Language } from "../types";

const copy = {
  ru: {
    title: "Аккаунт и безопасность",
    hint: "Подтверждайте способы входа для одного аккаунта GO IRL. Данные профиля провайдера не импортируются; совпадение email не объединяет аккаунты.",
    linked: "Подключено",
    current: "Текущий вход",
    link: "Подключить",
    linking: "Открываю подтверждение…",
    unavailable: "Нужна активная защищённая сессия GO IRL.",
    loadError: "Не удалось загрузить связанные способы входа.",
    linkedNow: "Способ входа подключён.",
    already: "Этот способ входа уже подключён.",
    conflict: "Этот аккаунт провайдера уже связан с другим аккаунтом GO IRL.",
    failed: "Не удалось подключить способ входа.",
  },
  uk: {
    title: "Акаунт і безпека",
    hint: "Прив'язуйте способи входу до одного акаунта GO IRL. Збіг email не об'єднує акаунти автоматично.",
    linked: "Підключено", current: "Поточний вхід", link: "Підключити", linking: "Відкриваю підтвердження…",
    unavailable: "Потрібна активна захищена сесія GO IRL.", loadError: "Не вдалося завантажити пов'язані способи входу.",
    linkedNow: "Спосіб входу підключено.", already: "Цей спосіб входу вже підключено.",
    conflict: "Цей акаунт провайдера вже пов'язаний з іншим акаунтом GO IRL.", failed: "Не вдалося підключити спосіб входу.",
  },
  cs: {
    title: "Účet a zabezpečení",
    hint: "Propojte způsoby přihlášení s jedním účtem GO IRL. Shodný e-mail účty automaticky neslučuje.",
    linked: "Připojeno", current: "Aktuální přihlášení", link: "Připojit", linking: "Otevírám ověření…",
    unavailable: "Je potřeba aktivní zabezpečená relace GO IRL.", loadError: "Propojené způsoby přihlášení se nepodařilo načíst.",
    linkedNow: "Způsob přihlášení byl připojen.", already: "Tento způsob přihlášení už je připojen.",
    conflict: "Tento účet poskytovatele je už propojen s jiným účtem GO IRL.", failed: "Způsob přihlášení se nepodařilo připojit.",
  },
  en: {
    title: "Account & Security",
    hint: "Verify sign-in methods for one GO IRL account. Provider profile data is not imported, and matching email never merges accounts.",
    linked: "Linked", current: "Current sign-in", link: "Link", linking: "Opening verification…",
    unavailable: "An active trusted GO IRL session is required.", loadError: "Could not load linked sign-in methods.",
    linkedNow: "Sign-in method linked.", already: "This sign-in method is already linked.",
    conflict: "This provider account is already linked to another GO IRL account.", failed: "Could not link this sign-in method.",
  },
} satisfies Record<Language, Record<string, string>>;

const providerLabel = (provider: "telegram" | WebTrustedIdentityProvider) =>
  provider === "telegram" ? "Telegram" : provider === "google" ? "Google" : "Facebook";

export function AccountSecuritySection({ language }: { language: Language }) {
  const t = copy[language];
  const session = getCurrentAuthSession();
  const currentProvider = session?.source === "trusted-provider"
    ? session.user.provider
    : session?.source === "trusted-telegram" ? "telegram" : null;
  const [identities, setIdentities] = useState<LinkedProviderIdentity[]>([]);
  const [feedback, setFeedback] = useState<AccountSecurityFeedback | null>(() => (
    typeof window === "undefined" ? null : consumeAccountSecurityFeedback(window.sessionStorage)
  ));
  const [error, setError] = useState("");
  const [startingProvider, setStartingProvider] = useState<WebTrustedIdentityProvider | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!session?.accessToken) return undefined;
    void fetchLinkedProviderIdentities(session.accessToken)
      .then((items) => { if (!cancelled) setIdentities(items); })
      .catch(() => { if (!cancelled) setError(t.loadError); });
    return () => { cancelled = true; };
  }, [session?.accessToken, t.loadError]);

  const activeProviders = useMemo(() => new Set(
    identities.filter((identity) => identity.status === "active").map((identity) => identity.provider),
  ), [identities]);

  const feedbackText = feedback?.status === "linked"
    ? t.linkedNow
    : feedback?.status === "already_linked"
      ? t.already
      : feedback?.error === "identity_conflict" ? t.conflict : feedback?.status === "error" ? t.failed : "";

  const startLink = async (provider: WebTrustedIdentityProvider) => {
    if (!session?.accessToken) return;
    setStartingProvider(provider);
    setFeedback(null);
    setError("");
    try {
      await beginWebAuth(provider, window.location.href, "link");
    } catch {
      setStartingProvider(null);
      setError(t.failed);
    }
  };

  const providers: Array<"telegram" | WebTrustedIdentityProvider> = [
    "telegram",
    "google",
    ...(isWebAuthProviderEnabled("facebook") ? ["facebook" as const] : []),
  ];

  return (
    <section className="profile-security" aria-labelledby="profile-security-title">
      <header><ShieldCheck aria-hidden="true" /><div><h3 id="profile-security-title">{t.title}</h3><p>{t.hint}</p></div></header>
      {!session?.accessToken ? <p className="profile-security-notice">{t.unavailable}</p> : null}
      {feedbackText ? <p className="profile-security-notice" role="status">{feedbackText}</p> : null}
      {error ? <p className="profile-security-error" role="alert">{error}</p> : null}
      <div className="profile-security-providers">
        {providers.map((provider) => {
          const linked = activeProviders.has(provider) || currentProvider === provider;
          const isCurrent = currentProvider === provider;
          const canLink = provider !== "telegram" && session?.accessToken && canLinkProvider(identities, provider);
          return (
            <div className="profile-security-provider" key={provider} data-provider={provider}>
              <span><strong>{providerLabel(provider)}</strong><small>{isCurrent ? t.current : linked ? t.linked : ""}</small></span>
              {canLink ? (
                <button type="button" disabled={startingProvider !== null} onClick={() => void startLink(provider as WebTrustedIdentityProvider)}>
                  <Link2 aria-hidden="true" />{startingProvider === provider ? t.linking : t.link}
                </button>
              ) : linked ? <b>{t.linked}</b> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
