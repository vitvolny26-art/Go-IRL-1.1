import type { BeautyWorkspace } from "./beautySetupModel";

const beautyShareTitleFontFamily = '"GO IRL Beauty Share Canvas"';
const beautyShareTitleFontUrl = "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf";
let beautyShareTitleFontPromise: Promise<FontFace> | null = null;

const loadBeautyShareTitleFont = () => {
  beautyShareTitleFontPromise ||= new FontFace(
    "GO IRL Beauty Share Canvas",
    `url("${beautyShareTitleFontUrl}")`,
    { style: "normal", weight: "400" },
  ).load().then((font) => {
    document.fonts.add(font);
    return font;
  });
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
  context.font = `400 ${fontSize}px ${beautyShareTitleFontFamily}`;
  context.textBaseline = "alphabetic";
  context.fillStyle = gradient;
  context.shadowColor = "rgba(196, 133, 40, 0.6)";
  context.shadowBlur = 4;
  context.fillText(title, 80, 150);
  context.restore();
};
