import {
  buildMessengerAndroidIntentTarget,
  buildMessengerAppTarget,
  buildMessengerSendTarget,
  type CardShareContent,
} from "./cardShare";
import { openExternal, openTelegramExternal } from "./openExternal";
import { installTelegramBeautyFileShareBridge } from "./telegramBeautyFileShareBridge";

installTelegramBeautyFileShareBridge();

export const openTelegramShareTarget = (url: string) => {
  openTelegramExternal(url);
};

export const openExternalShareTarget = (url: string) => {
  openExternal(url);
};

export const openMessengerShareTarget = (content: CardShareContent, userAgent = navigator.userAgent) => {
  if (/android/i.test(userAgent)) {
    window.location.href = buildMessengerAndroidIntentTarget(content);
    return;
  }
  if (/iphone|ipad|ipod/i.test(userAgent)) {
    window.location.href = buildMessengerAppTarget(content);
    return;
  }
  openExternalShareTarget(buildMessengerSendTarget(content));
};
