import { useEffect, useMemo, useState } from "react";
import { Link2, ShieldCheck, Trash2 } from "lucide-react";
import { submitAccountRequest, type AccountRequestResult } from "../accountRequest";
import { createAccountRequestTransport } from "../accountRequestTransport";
import {
  canLinkProvider,
  consumeAccountSecurityFeedback,
  fetchLinkedProviderIdentities,
  linkedProviderDisplayLabel,
  type AccountSecurityFeedback,
  type LinkedProviderIdentity,
} from "../auth/accountSecurity";
import { beginWebAuth, isWebAuthProviderEnabled } from "../auth/googleWebAuth";
import { clearTrustedSession, getCurrentAuthSession } from "../authSession";
import type { WebTrustedIdentityProvider } from "../auth/providerTrustedSession";
import { profilePathForSection } from "../profile/profileRoute";
import type { Language } from "../types";

const copy = {
  ru: {
    title: "Аккаунт и безопасность",
    hint: "Проверяйте, какой аккаунт провайдера привязан к GO IRL. Email, имя и username используются только для отображения; совпадение email не объединяет аккаунты.",
    linked: "Подключено",
    current: "Текущий вход",
    link: "Подключить",
    linking: "Открываю подтверждение…",
    unavailable: "Нужна активная защищённая сессия GO IRL.",
    loadError: "Не удалось загрузить связанные способы входа.",
    linkedNow: "Способ входа подключён.",
    already: "Этот способ входа уже подключён.",
    googleConflict: "Этот Google уже связан с другим аккаунтом GO IRL.",
    facebookConflict: "Этот Facebook уже связан с другим аккаунтом GO IRL.",
    transfer: "Перенести сюда",
    transferring: "Подтверждаю перенос…",
    transferred: "Способ входа перенесён в этот аккаунт. Дубликат GO IRL удалён.",
    transferBlocked: "Перенос недоступен: другой аккаунт GO IRL содержит данные или повышенные права.",
    transferConfirm: "Перенести этот способ входа в текущий аккаунт GO IRL? Пустой дубликат аккаунта будет удалён. Если в нём есть данные, роли или обязательства, перенос будет отклонён.",
    failed: "Не удалось подключить способ входа.",
    deleteTitle: "Удаление аккаунта",
    deleteHint: "Удаляет данные вашего обычного аккаунта GO IRL и завершает текущую сессию. Аккаунты с обязанностями организатора или повышенной ролью требуют отдельной обработки.",
    deleteAction: "Удалить аккаунт и данные",
    deleting: "Удаляю аккаунт…",
    deleteConfirm: "Удалить аккаунт GO IRL и связанные данные? Это действие нельзя отменить.",
    deleteSubmitted: "Аккаунт удалён.",
    deleteUnavailable: "Не удалось удалить аккаунт.",
    deleteAuthResolutionFailed: "Не удалось подготовить удаление связанных данных входа.",
    deleteReference: "Код удаления",
  },
  uk: {
    title: "Акаунт і безпека",
    hint: "Перевіряйте, який акаунт провайдера прив’язано до GO IRL. Email, ім’я та username використовуються лише для відображення; збіг email не об’єднує акаунти.",
    linked: "Підключено", current: "Поточний вхід", link: "Підключити", linking: "Відкриваю підтвердження…",
    unavailable: "Потрібна активна захищена сесія GO IRL.", loadError: "Не вдалося завантажити пов'язані способи входу.",
    linkedNow: "Спосіб входу підключено.", already: "Цей спосіб входу вже підключено.",
    googleConflict: "Цей Google уже пов'язаний з іншим акаунтом GO IRL.",
    facebookConflict: "Цей Facebook уже пов'язаний з іншим акаунтом GO IRL.",
    transfer: "Перенести сюди", transferring: "Підтверджую перенесення…", transferred: "Спосіб входу перенесено до цього акаунта. Дублікат GO IRL видалено.",
    transferBlocked: "Перенесення недоступне: інший акаунт GO IRL містить дані або підвищені права.",
    transferConfirm: "Перенести цей спосіб входу до поточного акаунта GO IRL? Порожній дублікат акаунта буде видалено. Якщо в ньому є дані, ролі або обов'язки, перенесення буде відхилено.",
    failed: "Не вдалося підключити спосіб входу.",
    deleteTitle: "Видалення акаунта", deleteHint: "Видаляє дані звичайного акаунта GO IRL і завершує поточну сесію. Акаунти з обов'язками організатора або підвищеною роллю потребують окремої обробки.",
    deleteAction: "Видалити акаунт і дані", deleting: "Видаляю акаунт…", deleteConfirm: "Видалити акаунт GO IRL і пов'язані дані? Цю дію не можна скасувати.",
    deleteSubmitted: "Акаунт видалено.", deleteUnavailable: "Не вдалося видалити акаунт.", deleteReference: "Код видалення",
    deleteAuthResolutionFailed: "Не вдалося підготувати видалення пов'язаних даних входу.",
  },
  cs: {
    title: "Účet a zabezpečení",
    hint: "Zkontrolujte, který účet poskytovatele je propojen s GO IRL. E-mail, jméno a username slouží jen k zobrazení; shodný e-mail účty neslučuje.",
    linked: "Připojeno", current: "Aktuální přihlášení", link: "Připojit", linking: "Otevírám ověření…",
    unavailable: "Je potřeba aktivní zabezpečená relace GO IRL.", loadError: "Propojené způsoby přihlášení se nepodařilo načíst.",
    linkedNow: "Způsob přihlášení byl připojen.", already: "Tento způsob přihlášení už je připojen.",
    googleConflict: "Tento účet Google je už propojen s jiným účtem GO IRL.",
    facebookConflict: "Tento Facebook je už propojen s jiným účtem GO IRL.",
    transfer: "Přenést sem", transferring: "Ověřuji přenos…", transferred: "Způsob přihlášení byl přenesen k tomuto účtu. Duplicitní účet GO IRL byl odstraněn.",
    transferBlocked: "Přenos není dostupný: druhý účet GO IRL obsahuje data nebo zvýšená oprávnění.",
    transferConfirm: "Přenést tento způsob přihlášení k aktuálnímu účtu GO IRL? Prázdný duplicitní účet bude odstraněn. Pokud obsahuje data, role nebo povinnosti, přenos bude zamítnut.",
    failed: "Způsob přihlášení se nepodařilo připojit.",
    deleteTitle: "Odstranění účtu", deleteHint: "Odstraní data běžného účtu GO IRL a ukončí aktuální relaci. Účty s povinnostmi organizátora nebo zvýšenou rolí vyžadují samostatné vyřízení.",
    deleteAction: "Odstranit účet a data", deleting: "Odstraňuji účet…", deleteConfirm: "Odstranit účet GO IRL a související data? Tuto akci nelze vrátit zpět.",
    deleteSubmitted: "Účet byl odstraněn.", deleteUnavailable: "Účet se nepodařilo odstranit.", deleteReference: "Kód odstranění",
    deleteAuthResolutionFailed: "Nepodařilo se připravit odstranění propojených přihlašovacích údajů.",
  },
  en: {
    title: "Account & Security",
    hint: "Verify which provider account is linked to GO IRL. Email, name, and username are display-only; matching email never merges accounts.",
    linked: "Linked", current: "Current sign-in", link: "Link", linking: "Opening verification…",
    unavailable: "An active trusted GO IRL session is required.", loadError: "Could not load linked sign-in methods.",
    linkedNow: "Sign-in method linked.", already: "This sign-in method is already linked.",
    googleConflict: "This Google account is already linked to another GO IRL account.",
    facebookConflict: "This Facebook account is already linked to another GO IRL account.",
    transfer: "Transfer here", transferring: "Verifying transfer…", transferred: "The sign-in method was transferred to this account. The duplicate GO IRL account was removed.",
    transferBlocked: "Transfer is unavailable because the other GO IRL account contains data or elevated privileges.",
    transferConfirm: "Transfer this sign-in method to the current GO IRL account? An empty duplicate account will be removed. If it contains data, roles, or obligations, the transfer will be rejected.",
    failed: "Could not link this sign-in method.",
    deleteTitle: "Delete account", deleteHint: "Deletes data for a standard GO IRL account and ends the current session. Accounts with organizer obligations or elevated roles require separate handling.",
    deleteAction: "Delete account and data", deleting: "Deleting account…", deleteConfirm: "Delete your GO IRL account and associated data? This action cannot be undone.",
    deleteSubmitted: "Account deleted.", deleteUnavailable: "Could not delete the account.", deleteReference: "Deletion reference",
    deleteAuthResolutionFailed: "Could not prepare deletion of linked sign-in data.",
  },
} satisfies Record<Language, Record<string, string>>;

const providerLabel = (provider: "telegram" | WebTrustedIdentityProvider) =>
  provider === "telegram" ? "Telegram" : provider === "google" ? "Google" : "Facebook";

const accountDeletionFeedback = (labels: typeof copy.en, result: AccountRequestResult | null) => {
  if (!result || result.kind !== "account_deletion") return "";
  const reference = result.status === "submitted" ? result.requestId : result.correlationId;
  const message = result.status === "submitted"
    ? labels.deleteSubmitted
    : result.status === "failed" && result.errorCode === "auth_resolution_failed"
      ? labels.deleteAuthResolutionFailed
      : labels.deleteUnavailable;
  return `${message} ${labels.deleteReference}: ${reference}.`;
};

const accountSecurityReturnUrl = () => new URL(profilePathForSection("security"), window.location.origin).toString();

export function AccountSecuritySection({ language }: { language: Language }) {
  const t = copy[language];
  const session = getCurrentAuthSession();
  const currentProvider = session?.source === "trusted-provider"
    ? session.user.provider
    : session?.source === "trusted-telegram" ? "telegram" : null;
  const accountRequestTransport = useMemo(() => createAccountRequestTransport(), []);
  const [identities, setIdentities] = useState<LinkedProviderIdentity[]>([]);
  const [feedback, setFeedback] = useState<AccountSecurityFeedback | null>(() => (
    typeof window === "undefined" ? null : consumeAccountSecurityFeedback(window.sessionStorage)
  ));
  const [error, setError] = useState("");
  const [startingProvider, setStartingProvider] = useState<WebTrustedIdentityProvider | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [accountRequestResult, setAccountRequestResult] = useState<AccountRequestResult | null>(null);

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

  const feedbackText = feedback?.status === "transferred"
    ? t.transferred
    : feedback?.status === "linked"
      ? t.linkedNow
      : feedback?.status === "already_linked"
        ? t.already
        : feedback?.error === "identity_transfer_blocked"
          ? t.transferBlocked
          : feedback?.error === "identity_conflict"
            ? feedback.provider === "google" ? t.googleConflict : t.facebookConflict
            : feedback?.status === "error" ? t.failed : "";
  const deletionFeedback = accountDeletionFeedback(t, accountRequestResult);

  const startLink = async (provider: WebTrustedIdentityProvider) => {
    if (!session?.accessToken) return;
    setStartingProvider(provider);
    setFeedback(null);
    setError("");
    try {
      await beginWebAuth(provider, accountSecurityReturnUrl(), "link");
    } catch {
      setStartingProvider(null);
      setError(t.failed);
    }
  };

  const startTransfer = async (provider: WebTrustedIdentityProvider) => {
    if (!session?.accessToken) return;
    if (!window.confirm(t.transferConfirm)) return;
    setStartingProvider(provider);
    setError("");
    try {
      await beginWebAuth(provider, accountSecurityReturnUrl(), "transfer");
    } catch {
      setStartingProvider(null);
      setError(t.failed);
    }
  };

  const requestAccountDeletion = async () => {
    if (!session?.accessToken || deleting) return;
    if (!window.confirm(t.deleteConfirm)) return;
    setDeleting(true);
    setAccountRequestResult(null);
    try {
      const result = await submitAccountRequest("account_deletion", { transport: accountRequestTransport });
      if (result.status === "submitted" && result.accountDeleted) {
        clearTrustedSession();
        window.location.replace("/");
        return;
      }
      setAccountRequestResult(result);
    } finally {
      setDeleting(false);
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
          const linkedIdentity = identities.find((identity) => identity.provider === provider && identity.status === "active") || null;
          const linkedAccount = linkedIdentity ? linkedProviderDisplayLabel(linkedIdentity) : "";
          const providerStatus = isCurrent ? t.current : linked ? t.linked : "";
          const providerDetail = [linkedAccount, providerStatus].filter(Boolean).join(" · ");
          const canLink = provider !== "telegram" && session?.accessToken && canLinkProvider(identities, provider);
          const canTransfer = provider !== "telegram"
            && Boolean(canLink)
            && feedback?.status === "error"
            && feedback.provider === provider
            && feedback.error === "identity_conflict";
          return (
            <div className="profile-security-provider" key={provider} data-provider={provider}>
              <span><strong>{providerLabel(provider)}</strong><small>{providerDetail}</small></span>
              {canTransfer ? (
                <button type="button" disabled={startingProvider !== null} onClick={() => void startTransfer(provider as WebTrustedIdentityProvider)}>
                  <Link2 aria-hidden="true" />{startingProvider === provider ? t.transferring : t.transfer}
                </button>
              ) : canLink ? (
                <button type="button" disabled={startingProvider !== null} onClick={() => void startLink(provider as WebTrustedIdentityProvider)}>
                  <Link2 aria-hidden="true" />{startingProvider === provider ? t.linking : t.link}
                </button>
              ) : linked ? <b>{t.linked}</b> : null}
            </div>
          );
        })}
      </div>
      <section className="profile-security-danger" aria-labelledby="profile-security-delete-title">
        <div><h4 id="profile-security-delete-title">{t.deleteTitle}</h4><p>{t.deleteHint}</p></div>
        <button type="button" className="is-danger" disabled={!session?.accessToken || deleting} onClick={() => void requestAccountDeletion()}>
          <Trash2 aria-hidden="true" />{deleting ? t.deleting : t.deleteAction}
        </button>
        {deletionFeedback ? <p className="profile-security-notice" role="status">{deletionFeedback}</p> : null}
      </section>
    </section>
  );
}
