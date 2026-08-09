export type GoIrlClient = "telegram" | "web";
export type GoIrlLaunchChannel = "telegram" | "whatsapp" | "messenger" | "instagram" | "facebook" | "web";

export type GoIrlLaunchContext = {
  client: GoIrlClient;
  channel: GoIrlLaunchChannel;
  inAppBrowser: boolean;
};

type TelegramLike = {
  WebApp?: {
    initData?: string;
    initDataUnsafe?: {
      user?: unknown;
    };
  };
};

export const resolveGoIrlClient = (telegram: TelegramLike | undefined): GoIrlClient =>
  telegram?.WebApp?.initData?.trim() || telegram?.WebApp?.initDataUnsafe?.user ? "telegram" : "web";

const socialLaunchChannels = new Set<GoIrlLaunchChannel>([
  "telegram",
  "whatsapp",
  "messenger",
  "instagram",
  "facebook",
]);

const channelFromSearch = (search: string) => {
  const source = new URLSearchParams(search).get("source")?.trim().toLowerCase() || "";
  return socialLaunchChannels.has(source as GoIrlLaunchChannel)
    ? source as Exclude<GoIrlLaunchChannel, "web">
    : null;
};

const channelFromUserAgent = (userAgent: string) => {
  if (/messenger|fban\/messenger/i.test(userAgent)) return "messenger" as const;
  if (/instagram/i.test(userAgent)) return "instagram" as const;
  if (/whatsapp/i.test(userAgent)) return "whatsapp" as const;
  if (/telegram/i.test(userAgent)) return "telegram" as const;
  if (/fb_iab|fban|fbav|fbios/i.test(userAgent)) return "facebook" as const;
  return null;
};

export const resolveGoIrlLaunchContext = (input: {
  telegram?: TelegramLike;
  search?: string;
  userAgent?: string;
}): GoIrlLaunchContext => {
  const client = resolveGoIrlClient(input.telegram);
  if (client === "telegram") return { client, channel: "telegram", inAppBrowser: true };

  const channel = channelFromSearch(input.search || "")
    || channelFromUserAgent(input.userAgent || "")
    || "web";
  return {
    client,
    channel,
    inAppBrowser: channel !== "web",
  };
};

export const applyGoIrlLaunchContext = (
  root: Pick<HTMLElement, "dataset">,
  context: GoIrlLaunchContext,
) => {
  root.dataset.goIrlClient = context.client;
  root.dataset.goIrlChannel = context.channel;
  root.dataset.goIrlInAppBrowser = String(context.inAppBrowser);
};
