import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, MoreHorizontal, Share2 } from "lucide-react";
import {
  buildCardShareDownloadUrl,
  buildCardShareLandingUrl,
  buildCardShareTarget,
  buildOrganicCardShareContent,
  buildCardShareText,
  isActivitySharePublicAlias,
  isBeautyCardShareContent,
} from "../cardShare";
import { openExternalShareTarget, openTelegramShareTarget } from "../cardShareNavigation";
import { getTelegramWebApp } from "../telegram";
import type { PreparedTelegramShareResult } from "../telegramPreparedShare";
import { canPrepareBeautyTelegramShare, sharePreparedTelegramBeauty } from "../telegramPreparedBeautyShare";
import type { ShareProvider } from "../userPreferences";
import { getCurrentChatIdentity, loadActivityChatMessages } from "../activityChatFeature";
import {
  activityChatUnreadChangedEvent,
  countUnreadActivityChatMessages,
  loadActivityChatReadAt,
} from "../activityChatUnread";
import { activityIdFromInviteUrl, canShowEventCardUnread } from "../cardChatUnread";
import { useAppStore } from "../store";
import "./card-chat-unread.css";

type CardShareActionProps = {
  title: string;
  date: string;
  address: string;
  url: string;
  label: string;
  onTelegramShare?: () => Promise<PreparedTelegramShareResult>;
};

type ShareChannel = ShareProvider | "facebook" | "native";
type ActivityChatUnreadChangedDetail = { activityId?: string };
type PreparedWhatsAppShare = {
  file: File | null;
  downloadUrl: string;
  shareAlias: string;
  text: string;
  directSend: boolean;
  downloadAccepted: boolean;
  error: string | null;
};

const maxPreparedWhatsAppImageBytes = 8 * 1024 * 1024;

const channels: Array<{ id: ShareChannel; label: string; icon: string | null }> = [
  { id: "telegram", label: "Telegram", icon: "/icons/telegram.svg" },
  { id: "facebook", label: "Facebook", icon: "/icons/facebook.svg" },
  { id: "messenger", label: "Messenger", icon: "/icons/messenger.svg" },
  { id: "whatsapp", label: "WhatsApp", icon: "/icons/whatsapp.svg" },
  { id: "instagram", label: "Instagram", icon: "/icons/instagram.svg" },
  { id: "native", label: "Поделиться", icon: null },
];

const moreLabels = {
  ru: "Все варианты",
  uk: "Усі варіанти",
  cs: "Další možnosti",
  en: "More options",
} as const;

const whatsappLabels = {
  ru: {
    preparing: "Готовим карточку…",
    title: "Карточка готова",
    fallbackHint: "Скачайте карточку, затем откройте WhatsApp и прикрепите JPEG из загрузок.",
    download: "Скачать JPEG",
    open: "Отправить в WhatsApp",
    share: "Поделиться",
    close: "Закрыть",
    cancelled: "Скачивание карточки отменено.",
    failed: "Не удалось подготовить JPEG. Попробуйте ещё раз.",
  },
  uk: {
    preparing: "Готуємо картку…",
    title: "Картка готова",
    fallbackHint: "Завантажте картку, потім відкрийте WhatsApp і прикріпіть JPEG із завантажень.",
    download: "Завантажити JPEG",
    open: "Надіслати у WhatsApp",
    share: "Поділитися",
    close: "Закрити",
    cancelled: "Завантаження картки скасовано.",
    failed: "Не вдалося підготувати JPEG. Спробуйте ще раз.",
  },
  cs: {
    preparing: "Připravuji kartu…",
    title: "Karta je připravena",
    fallbackHint: "Stáhněte kartu, potom otevřete WhatsApp a přiložte JPEG ze stažených souborů.",
    download: "Stáhnout JPEG",
    open: "Odeslat do WhatsApp",
    share: "Sdílet",
    close: "Zavřít",
    cancelled: "Stažení karty bylo zrušeno.",
    failed: "JPEG se nepodařilo připravit. Zkuste to znovu.",
  },
  en: {
    preparing: "Preparing card…",
    title: "Card ready",
    fallbackHint: "Download the card, then open WhatsApp and attach the JPEG from your downloads.",
    download: "Download JPEG",
    open: "Send to WhatsApp",
    share: "Share",
    close: "Close",
    cancelled: "Card download was cancelled.",
    failed: "Could not prepare the JPEG. Please try again.",
  },
} as const;

export function CardShareAction({ title, date, address, url, label, onTelegramShare }: CardShareActionProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preparingWhatsApp, setPreparingWhatsApp] = useState(false);
  const [preparedWhatsApp, setPreparedWhatsApp] = useState<PreparedWhatsAppShare | null>(null);
  const [preparedWhatsAppPreviewUrl, setPreparedWhatsAppPreviewUrl] = useState("");
  const rootRef = useRef<HTMLSpanElement>(null);
  const activityId = useMemo(() => activityIdFromInviteUrl(url), [url]);
  const joinedIds = useAppStore((state) => state.joinedIds);
  const language = useAppStore((state) => state.language);
  const content = { title, date, address, url, language };
  const canAccessChat = Boolean(activityId && joinedIds.includes(activityId));
  const showUnread = canShowEventCardUnread(activityId, joinedIds, unreadCount);
  const whatsappCopy = whatsappLabels[language];

  useEffect(() => {
    if (!preparedWhatsApp?.file) {
      setPreparedWhatsAppPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(preparedWhatsApp.file);
    setPreparedWhatsAppPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [preparedWhatsApp?.file]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setExpanded(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setExpanded(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    let active = true;

    const refreshUnread = async () => {
      if (!canAccessChat || !activityId) {
        if (active) setUnreadCount(0);
        return;
      }

      try {
        const [identity, messages] = await Promise.all([
          getCurrentChatIdentity(),
          loadActivityChatMessages(activityId),
        ]);
        const lastReadAt = loadActivityChatReadAt(activityId, identity.userKey);
        const nextUnreadCount = countUnreadActivityChatMessages(messages, identity.userKey, lastReadAt);
        if (active) setUnreadCount(nextUnreadCount);
      } catch {
        if (active) setUnreadCount(0);
      }
    };

    const handleUnreadChanged = (event: Event) => {
      const detail = (event as CustomEvent<ActivityChatUnreadChangedDetail>).detail;
      if (detail?.activityId && detail.activityId !== activityId) return;
      void refreshUnread();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshUnread();
    };

    void refreshUnread();
    window.addEventListener(activityChatUnreadChangedEvent, handleUnreadChanged);
    window.addEventListener("focus", refreshUnread);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.removeEventListener(activityChatUnreadChangedEvent, handleUnreadChanged);
      window.removeEventListener("focus", refreshUnread);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activityId, canAccessChat]);

  const copyShareText = async (shareUrl = url) => {
    const shareText = buildCardShareText({ ...content, url: shareUrl });
    try {
      await navigator.clipboard.writeText(shareText);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = shareText;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  };

  const canNativeShareFile = (file: File) => {
    if (typeof navigator.share !== "function") return false;
    try {
      return typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  };

  const prepareWhatsAppCard = async () => {
    setOpen(false);
    setExpanded(false);
    setPreparingWhatsApp(true);
    const downloadUrl = buildCardShareDownloadUrl(content);

    if (!downloadUrl) {
      setPreparedWhatsApp({
        file: null,
        downloadUrl: "",
        shareAlias: "",
        text: "",
        directSend: false,
        downloadAccepted: false,
        error: whatsappCopy.failed,
      });
      setPreparingWhatsApp(false);
      return;
    }

    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error(`Card image request failed: ${response.status}`);
      const isServiceShare = isBeautyCardShareContent(content);
      const activityShareAlias = response.headers.get("x-go-irl-share-alias")?.trim() || "";
      if (!isServiceShare && !isActivitySharePublicAlias(activityShareAlias)) {
        throw new Error("Missing Activity share alias");
      }
      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() || "";
      if (contentType !== "image/jpeg") throw new Error(`Unexpected card image type: ${contentType || "missing"}`);
      const blob = await response.blob();
      if (blob.size === 0 || blob.size > maxPreparedWhatsAppImageBytes) {
        throw new Error(`Unexpected card image size: ${blob.size}`);
      }
      const landingUrl = buildCardShareLandingUrl(isServiceShare
        ? content
        : { ...content, shareAlias: activityShareAlias });
      const serviceSlug = isServiceShare
        ? decodeURIComponent(new URL(landingUrl).pathname.match(/^\/s\/([^/]+)\/?$/)?.[1] || "")
        : "";
      const shareAlias = isServiceShare ? serviceSlug : activityShareAlias;
      if (!shareAlias) throw new Error("Missing Service share slug");
      const file = new File([blob], `${shareAlias}.jpg`, { type: "image/jpeg" });
      setPreparedWhatsApp({
        file,
        downloadUrl,
        shareAlias,
        text: landingUrl,
        directSend: canNativeShareFile(file),
        downloadAccepted: false,
        error: null,
      });
    } catch {
      setPreparedWhatsApp({
        file: null,
        downloadUrl,
        shareAlias: "",
        text: "",
        directSend: false,
        downloadAccepted: false,
        error: whatsappCopy.failed,
      });
    } finally {
      setPreparingWhatsApp(false);
    }
  };

  const share = async (channel: Exclude<ShareChannel, "whatsapp">) => {
    setOpen(false);
    setExpanded(false);

    if (channel === "telegram") {
      if (onTelegramShare) {
        const result = await onTelegramShare();
        if (result === "shared" || result === "cancelled") return;
      } else if (canPrepareBeautyTelegramShare(url)) {
        const result = await sharePreparedTelegramBeauty(url, date, language);
        if (result === "shared" || result === "cancelled") return;
      }
      openTelegramShareTarget(buildCardShareTarget(channel, content));
      return;
    }

    if (channel === "facebook") {
      openExternalShareTarget(buildCardShareTarget(channel, content));
      return;
    }

    const organicContent = buildOrganicCardShareContent(content);
    if (navigator.share) {
      try {
        await navigator.share(organicContent);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copyShareText(organicContent.url);
    if (channel === "instagram") openExternalShareTarget("https://www.instagram.com/");
  };

  const downloadPreparedWhatsApp = () => {
    const prepared = preparedWhatsApp;
    if (!prepared?.downloadUrl) return;

    const webApp = getTelegramWebApp();
    const canUseTelegramDownload = Boolean(webApp?.downloadFile)
      && (!webApp?.isVersionAtLeast || webApp.isVersionAtLeast("8.0"));

    if (canUseTelegramDownload && webApp?.downloadFile) {
      setPreparedWhatsApp((current) => current
        ? { ...current, downloadAccepted: false, error: null }
        : current);
      try {
        webApp.downloadFile(
          { url: prepared.downloadUrl, file_name: prepared.shareAlias ? `${prepared.shareAlias}.jpg` : "go-irl-card.jpg" },
          (accepted) => {
            setPreparedWhatsApp((current) => current
              ? {
                  ...current,
                  downloadAccepted: accepted,
                  error: accepted ? null : whatsappCopy.cancelled,
                }
              : current);
          },
        );
        return;
      } catch {
        // Fall back to a browser download below.
      }
    }

    if (!prepared.file) {
      setPreparedWhatsApp((current) => current
        ? { ...current, downloadAccepted: false, error: whatsappCopy.failed }
        : current);
      return;
    }

    try {
      const objectUrl = URL.createObjectURL(prepared.file);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = prepared.shareAlias ? `${prepared.shareAlias}.jpg` : "go-irl-card.jpg";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setPreparedWhatsApp((current) => current
        ? { ...current, downloadAccepted: true, error: null }
        : current);
    } catch {
      setPreparedWhatsApp((current) => current
        ? { ...current, downloadAccepted: false, error: whatsappCopy.failed }
        : current);
    }
  };

  const openPreparedWhatsApp = async () => {
    const prepared = preparedWhatsApp;
    if (!prepared) return;

    if (prepared.directSend && prepared.file && typeof navigator.share === "function") {
      try {
        await navigator.share({ files: [prepared.file], title, text: prepared.text });
        setPreparedWhatsApp(null);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPreparedWhatsApp((current) => current
          ? {
              ...current,
              directSend: false,
              error: null,
            }
          : current);
        return;
      }
    }

    if (!prepared.text) return;
    openExternalShareTarget(`https://wa.me/?text=${encodeURIComponent(prepared.text)}`);
    setPreparedWhatsApp(null);
  };

  const activate = () => {
    if (open) {
      setOpen(false);
      setExpanded(false);
      return;
    }
    setExpanded(false);
    setOpen(true);
  };

  const openUnreadChat = () => {
    const card = rootRef.current?.closest("article");
    const chatAction = card?.querySelector<HTMLButtonElement>(".compact-sport-actions .sport-coach-action");
    if (!chatAction) return;
    setUnreadCount(0);
    chatAction.click();
  };

  const visibleChannels = expanded ? channels : channels.slice(0, 1);
  const moreLabel = moreLabels[language];

  return (
    <span className="card-share-action" ref={rootRef}>
      {showUnread ? (
        <button
          className="event-chat-unread-alert"
          type="button"
          aria-label={`Непрочитанные сообщения: ${unreadCount}`}
          title="Открыть непрочитанные сообщения"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openUnreadChat();
          }}
        >
          <MessageCircle size={18} aria-hidden="true" />
          <span>{unreadCount > 99 ? "99+" : unreadCount}</span>
        </button>
      ) : null}
      <button
        className="sport-card-icon-action"
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          activate();
        }}
      >
        <svg className="card-share-forward-icon" viewBox="8 12 50 36" aria-hidden="true">
          <path d="M10 45C16 30 27 23 42 23V13L56 28 42 43V33C29 33 20 37 10 45Z" />
        </svg>
      </button>
      {open ? (
        <span className={`card-share-channel-list ${expanded ? "is-expanded" : "is-compact"}`} role="menu" aria-label={label}>
          {visibleChannels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              role="menuitem"
              aria-label={channel.label}
              title={channel.label}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (channel.id === "whatsapp") {
                  void prepareWhatsAppCard();
                } else {
                  void share(channel.id);
                }
              }}
            >
              <span className="card-share-icon-circle">
                {channel.icon
                  ? <img src={channel.icon} alt="" decoding="async" />
                  : <Share2 size={28} aria-hidden="true" />}
              </span>
            </button>
          ))}
          {!expanded ? (
            <button
              className="card-share-more-action"
              type="button"
              role="menuitem"
              aria-label={moreLabel}
              title={moreLabel}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setExpanded(true);
              }}
            >
              <span className="card-share-icon-circle">
                <MoreHorizontal size={30} aria-hidden="true" />
              </span>
            </button>
          ) : null}
        </span>
      ) : null}
      {typeof document !== "undefined" && (preparingWhatsApp || preparedWhatsApp) ? createPortal(
        <div className="whatsapp-share-prepared-backdrop" role="presentation">
          <section className="whatsapp-share-prepared" role="dialog" aria-modal="true" aria-label={whatsappCopy.title}>
            {preparedWhatsApp ? (
              <>
                <strong>{whatsappCopy.title}</strong>
                {preparedWhatsAppPreviewUrl ? (
                  <img src={preparedWhatsAppPreviewUrl} alt="" />
                ) : null}
                {!preparedWhatsApp.directSend ? (
                  <p className="whatsapp-share-instruction">{whatsappCopy.fallbackHint}</p>
                ) : null}
                {preparedWhatsApp.error ? <p role="alert">{preparedWhatsApp.error}</p> : null}
                {!preparedWhatsApp.directSend ? (
                  <button
                    className="whatsapp-share-download"
                    type="button"
                    onClick={downloadPreparedWhatsApp}
                    disabled={!preparedWhatsApp.downloadUrl}
                  >
                    {whatsappCopy.download}
                  </button>
                ) : null}
                <button
                  className="whatsapp-share-send"
                  type="button"
                  onClick={() => { void openPreparedWhatsApp(); }}
                  disabled={!preparedWhatsApp.text}
                >
                  <img src="/icons/whatsapp.svg" alt="" />
                  {preparedWhatsApp.directSend ? whatsappCopy.share : whatsappCopy.open}
                </button>
                <button className="whatsapp-share-close" type="button" onClick={() => setPreparedWhatsApp(null)}>
                  {whatsappCopy.close}
                </button>
              </>
            ) : <strong>{whatsappCopy.preparing}</strong>}
          </section>
        </div>,
        document.body,
      ) : null}
    </span>
  );
}
