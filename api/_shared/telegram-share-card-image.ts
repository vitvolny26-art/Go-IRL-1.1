import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import type { TelegramEventCardInput } from "./telegram-event-card.js";
import { resolveEventShareBackgroundUrl, serviceShareBackgroundUrls } from "./event-share-backgrounds.js";
import { buildBeautyShareCardSvg, buildTelegramBeautyShareCardSvg } from "./beauty-share-card-svg.js";
import { buildMetaInvitationCardSvg, buildTelegramShareCardSvg } from "./telegram-share-card-svg.js";
import { readEnv } from "./env.js";

const require = createRequire(import.meta.url);
let sharpPromise: Promise<typeof import("sharp").default> | null = null;
let beautyScriptFontPromise: Promise<string | null> | null = null;

const beautyScriptFontUrl = "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf";
const beautyScriptFontFileName = "GreatVibes-Regular.ttf";

const xml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const isUsableFontFile = (path: string) => {
  try {
    const size = statSync(path).size;
    return size >= 100_000 && size <= 1_000_000;
  } catch {
    return false;
  }
};

const downloadBeautyScriptFont = async () => {
  const configuredPath = process.env.GO_IRL_BEAUTY_SCRIPT_FONT_PATH?.trim();
  if (configuredPath && isUsableFontFile(configuredPath)) return configuredPath;

  const fontDirectory = join(tmpdir(), "go-irl-fonts");
  const fontPath = join(fontDirectory, beautyScriptFontFileName);
  if (isUsableFontFile(fontPath)) return fontPath;

  mkdirSync(fontDirectory, { recursive: true });
  const temporaryPath = `${fontPath}.${process.pid}.tmp`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(beautyScriptFontUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: { accept: "font/ttf,application/octet-stream;q=0.9,*/*;q=0.1" },
    });
    if (!response.ok) throw new Error("beauty_script_font_download_failed");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 100_000 || bytes.length > 1_000_000) {
      throw new Error("beauty_script_font_size_invalid");
    }
    writeFileSync(temporaryPath, bytes);
    renameSync(temporaryPath, fontPath);
    return fontPath;
  } finally {
    clearTimeout(timeout);
    rmSync(temporaryPath, { force: true });
  }
};

const resolveBeautyScriptFont = () => {
  beautyScriptFontPromise ||= downloadBeautyScriptFont().catch(() => null);
  return beautyScriptFontPromise;
};

export function configureTelegramShareCardFonts(scriptFontPath: string | null = null) {
  const regularFont = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf");
  const boldFont = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf");
  const configDirectory = join(tmpdir(), "go-irl-fontconfig");
  const cacheDirectory = join(configDirectory, "cache");
  const configFile = join(configDirectory, "fonts.conf");
  const fontDirectories = Array.from(new Set([
    dirname(regularFont),
    ...(scriptFontPath ? [dirname(scriptFontPath)] : []),
  ]));

  mkdirSync(cacheDirectory, { recursive: true });
  writeFileSync(configFile, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
${fontDirectories.map((directory) => `  <dir>${xml(directory)}</dir>`).join("\n")}
  <cachedir>${xml(cacheDirectory)}</cachedir>
  <alias><family>sans-serif</family><prefer><family>DejaVu Sans</family></prefer></alias>
  <alias><family>Arial</family><prefer><family>DejaVu Sans</family></prefer></alias>
  <alias><family>Segoe UI Emoji</family><prefer><family>DejaVu Sans</family></prefer></alias>
  <alias binding="strong">
    <family>GO IRL Beauty Script</family>
    <prefer><family>Great Vibes</family></prefer>
    <default><family>DejaVu Serif</family></default>
  </alias>
</fontconfig>`, "utf8");

  process.env.FONTCONFIG_PATH = configDirectory;
  process.env.FONTCONFIG_FILE = configFile;
  return { regularFont, boldFont, scriptFontPath, configFile };
}

const loadSharp = async () => {
  const scriptFontPath = await resolveBeautyScriptFont();
  configureTelegramShareCardFonts(scriptFontPath);
  sharpPromise ||= import("sharp").then((module) => module.default);
  return sharpPromise;
};

const metaDetailsCopy = {
  ru: "Подробнее",
  uk: "Детальніше",
  cs: "Více informací",
  en: "More details",
} as const;

export const buildMetaInvitationCtaSvg = (input: TelegramEventCardInput) => {
  const label = metaDetailsCopy[input.language] || metaDetailsCopy.en;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="120" viewBox="0 0 1080 120">
    <rect width="1080" height="120" fill="#0a0e10"/>
    <rect x="60" y="18" width="960" height="84" rx="42" fill="#c9ff3d"/>
    <text x="540" y="71" text-anchor="middle" dominant-baseline="middle" fill="#101410" font-size="36" font-weight="900" font-family="DejaVu Sans, sans-serif">${xml(label)}</text>
  </svg>`;
};

export const hasEventShareBackground = (input: TelegramEventCardInput) => {
  const backgroundUrl = resolveEventShareBackgroundUrl(input);
  return Boolean(backgroundUrl && existsSync(backgroundUrl));
};

const trustedTelegramAvatarHosts = ["t.me", "telegram.org", "telegram-cdn.org"];

export const isTrustedOrganizerAvatarUrl = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (trustedTelegramAvatarHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return true;
    const supabaseUrl = readEnv("SUPABASE_URL");
    return Boolean(supabaseUrl && url.hostname === new URL(supabaseUrl).hostname);
  } catch {
    return false;
  }
};

const loadOrganizerAvatar = async (value?: string) => {
  if (!value || !isTrustedOrganizerAvatarUrl(value)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(value, { signal: controller.signal, redirect: "follow" });
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 2_000_000) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2_000_000) return null;
    const sharp = await loadSharp();
    const mask = Buffer.from('<svg width="128" height="128"><rect width="128" height="128" rx="16" fill="white"/></svg>');
    return sharp(bytes)
      .resize(128, 128, { fit: "cover", position: "attention" })
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const renderShareCardJpeg = async (
  svg: string,
  input: TelegramEventCardInput,
  width = 1080,
  organizerLeft = 78,
) => {
  const sharp = await loadSharp();
  const backgroundUrl = resolveEventShareBackgroundUrl(input);
  const organizerAvatar = await loadOrganizerAvatar(input.organizerAvatarUrl);
  const overlays = [
    { input: Buffer.from(svg), left: 0, top: 0 },
    ...(organizerAvatar ? [{ input: organizerAvatar, left: organizerLeft, top: 716 }] : []),
  ];

  if (backgroundUrl && existsSync(backgroundUrl)) {
    return sharp(readFileSync(backgroundUrl))
      .resize(width, 900, { fit: "cover", position: "attention" })
      .composite(overlays)
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
      .toBuffer();
  }

  return sharp(Buffer.from(svg))
    .composite(organizerAvatar ? [{ input: organizerAvatar, left: organizerLeft, top: 716 }] : [])
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
};

const renderBeautyCardJpeg = async (input: TelegramEventCardInput, telegram = false) => {
  const sharp = await loadSharp();
  const width = 1080;
  const height = telegram ? 900 : 1020;
  const backgroundUrl = serviceShareBackgroundUrls.manicure;
  const svg = telegram ? buildTelegramBeautyShareCardSvg(input) : buildBeautyShareCardSvg(input);
  const overlay = { input: Buffer.from(svg), left: 0, top: 0 };
  if (existsSync(backgroundUrl)) {
    return sharp(readFileSync(backgroundUrl))
      .resize(width, height, { fit: "cover", position: "attention" })
      .composite([overlay])
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
      .toBuffer();
  }
  return sharp({ create: { width, height, channels: 3, background: "#160d1d" } })
    .composite([overlay])
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
};

export const renderTelegramShareCardJpeg = (input: TelegramEventCardInput) =>
  renderShareCardJpeg(buildTelegramShareCardSvg(input), input, 1200, 138);

export const renderBeautyShareCardJpeg = (input: TelegramEventCardInput) =>
  renderBeautyCardJpeg(input);

export const renderTelegramBeautyShareCardJpeg = (input: TelegramEventCardInput) =>
  renderBeautyCardJpeg(input, true);

export const renderMetaInvitationCardJpeg = async (input: TelegramEventCardInput) => {
  const sharp = await loadSharp();
  const portraitCard = await renderShareCardJpeg(buildMetaInvitationCardSvg(input), input);
  return sharp(portraitCard)
    .extend({ bottom: 120, background: "#0a0e10" })
    .composite([{ input: Buffer.from(buildMetaInvitationCtaSvg(input)), left: 0, top: 900 }])
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
};