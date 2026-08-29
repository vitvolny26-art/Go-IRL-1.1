import type { BeautyWorkspace } from "./beautySetupModel";

const beautyShareTitleFontFamily = '"GO IRL Beauty Share Canvas"';
const beautyShareTitleFontFallback = '"GO IRL Beauty Script Web", "Great Vibes", cursive';
const beautyShareTitleFontUrl = "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf";
const beautyShareTitleFontTimeoutMs = 4_000;
let beautyShareTitleFontPromise: Promise<FontFace | null> | null = null;

const loadBeautyShareTitleFont = () => {
  beautyShareTitleFontPromise ||= (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), beautyShareTitleFontTimeoutMs);
    try {
      const response = await fetch(beautyShareTitleFontUrl, {
        signal: controller.signal,
        cache: "force-cache",
      });
      if (!response.ok) throw new Error("beauty_share_title_font_download_failed");
      const fontBytes = await response.arrayBuffer();
      const font = new FontFace(
        "GO IRL Beauty Share Canvas",
        fontBytes,
        { style: "normal", weight: "400" },
      );
      document.fonts.add(font);
      return font;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  })();
  return beautyShareTitleFontPromise;
};

export const drawBeautyShareTitle = async (
  context: CanvasRenderingContext2D,
  workspace: BeautyWorkspace,
) => {
  const title = workspace.profile.displayName.trim() || "GO IRL Beauty";
  const fontSize = title.length > 34 ? 62 : title.length > 24 ? 76 : 100;
  await loadBeautyShareTitleFont();

  const gradient = context.createLinearGradient(80, 78, 620, 180);
  gradient.addColorStop(0, "#fff8d6");
  gradient.addColorStop(0.25, "#e2b453");
  gradient.addColorStop(0.5, "#ffea9f");
  gradient.addColorStop(0.75, "#a87122");
  gradient.addColorStop(1, "#f5d685");

  context.save();
  context.font = `400 ${fontSize}px ${beautyShareTitleFontFamily}, ${beautyShareTitleFontFallback}`;
  context.textBaseline = "alphabetic";
  context.fillStyle = gradient;
  context.shadowColor = "rgba(196, 133, 40, 0.6)";
  context.shadowBlur = 4;
  context.fillText(title, 80, 150);
  context.restore();
};
