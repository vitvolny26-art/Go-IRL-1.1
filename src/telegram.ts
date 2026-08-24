declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        close?: () => void;
        initData?: string;
        initDataUnsafe?: {
          start_param?: string;
          user?: { id?: number; first_name?: string; last_name?: string; username?: string };
        };
        BackButton?: {
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
        MainButton?: {
          show: () => void;
          hide: () => void;
          setText: (text: string) => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
        HapticFeedback?: { impactOccurred: (style: string) => void; notificationOccurred: (type: string) => void };
        openTelegramLink?: (url: string) => void;
        openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
        shareMessage?: (preparedMessageId: string, callback?: (success: boolean) => void) => void;
        requestChat?: (requestId: string, callback?: (success: boolean) => void) => void;
        downloadFile?: (
          params: { url: string; file_name: string },
          callback?: (accepted: boolean) => void,
        ) => void;
        isVersionAtLeast?: (version: string) => boolean;
        version?: string;
      };
    };
  }
}

export const getTelegramWebApp = () =>
  typeof window === "undefined" ? undefined : window.Telegram?.WebApp;

export const isTelegramWebApp = () => Boolean(getTelegramWebApp()?.initDataUnsafe);

export const getTelegramInitData = () => getTelegramWebApp()?.initData || "";

export const readyMiniApp = () => getTelegramWebApp()?.ready();

export const expandMiniApp = () => getTelegramWebApp()?.expand();

export const closeMiniApp = () => {
  const webApp = getTelegramWebApp();
  if (!webApp?.close) return false;
  webApp.close();
  return true;
};

type BackButtonHandler = () => void;

type BackButtonRegistration = {
  id: number;
  onClick: BackButtonHandler;
  priority: number;
};

export type BackButtonOptions = {
  priority?: number;
};

const backButtonHandlers: BackButtonRegistration[] = [];
let backButtonDispatcherAttached = false;
let nextBackButtonHandlerId = 0;

const dispatchBackButton = () => {
  let activeRegistration: BackButtonRegistration | undefined;

  for (const registration of backButtonHandlers) {
    const hasHigherPriority = !activeRegistration || registration.priority > activeRegistration.priority;
    const isNewerAtSamePriority = activeRegistration
      && registration.priority === activeRegistration.priority
      && registration.id > activeRegistration.id;

    if (hasHigherPriority || isNewerAtSamePriority) activeRegistration = registration;
  }

  activeRegistration?.onClick();
};

const getSupportedBackButton = () => {
  const webApp = getTelegramWebApp();
  if (!webApp?.BackButton || webApp.isVersionAtLeast?.("6.1") !== true) return undefined;
  return webApp.BackButton;
};

const syncBackButton = () => {
  const backButton = getSupportedBackButton();
  if (!backButton) return;

  if (backButtonHandlers.length === 0) {
    if (backButtonDispatcherAttached) {
      backButton.offClick(dispatchBackButton);
      backButtonDispatcherAttached = false;
    }
    backButton.hide();
    return;
  }

  if (!backButtonDispatcherAttached) {
    backButton.onClick(dispatchBackButton);
    backButtonDispatcherAttached = true;
  }
  backButton.show();
};

export const showBackButton = (onClick: () => void, options: BackButtonOptions = {}) => {
  const registration: BackButtonRegistration = {
    id: ++nextBackButtonHandlerId,
    onClick,
    priority: options.priority ?? 0,
  };
  backButtonHandlers.push(registration);
  syncBackButton();

  return () => {
    const index = backButtonHandlers.findIndex((item) => item.id === registration.id);
    if (index >= 0) backButtonHandlers.splice(index, 1);
    syncBackButton();
  };
};

export const hideBackButton = () => getSupportedBackButton()?.hide();

export const notifyTelegram = (type: "success" | "warning" | "error") =>
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred(type);

export const impactTelegram = (style: string) =>
  getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);

export const requestTelegramChat = (preparedButtonId: string) => new Promise<boolean>((resolve, reject) => {
  const webApp = getTelegramWebApp();
  if (!preparedButtonId) {
    reject(new Error("prepared_chat_picker_id_required"));
    return;
  }
  if (!webApp?.requestChat || webApp.isVersionAtLeast?.("9.6") !== true) {
    reject(new Error("telegram_chat_picker_unsupported"));
    return;
  }
  webApp.requestChat(preparedButtonId, (success) => resolve(Boolean(success)));
});
