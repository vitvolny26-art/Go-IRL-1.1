import { buildBeautyShareCardPreviewInput } from "./beautyShareCardPreview";
import { beautyContentLanguages, type BeautyWorkspace } from "./beautySetupModel";

const SOCIAL_WIDTH = 1600;
const SOCIAL_HEIGHT = 900;
const variants = ["post", "story"] as const;

const svgToJpeg = async (svg: string, width: number, height: number) => {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("beauty_social_image_load_failed")); image.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = SOCIAL_WIDTH;
    canvas.height = SOCIAL_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("beauty_social_canvas_unavailable");
    context.fillStyle = "#09090b";
    context.fillRect(0, 0, SOCIAL_WIDTH, SOCIAL_HEIGHT);
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const x = (SOCIAL_WIDTH - drawWidth) / 2;
    const y = (SOCIAL_HEIGHT - drawHeight) / 2;
    context.drawImage(image, x, y, drawWidth, drawHeight);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("beauty_social_jpeg_failed")), "image/jpeg", 0.9));
  } finally { URL.revokeObjectURL(url); }
};

export const buildBeautySocialAssets = async (workspace: BeautyWorkspace) => {
  const { buildTelegramBeautyShareCardSvg } = await import("../../api/_shared/beauty-share-card-svg.js");
  const assets: Array<{ language: string; variant: "post" | "story"; blob: Blob }> = [];
  for (const language of beautyContentLanguages) {
    const input = buildBeautyShareCardPreviewInput(workspace, language);
    const svg = buildTelegramBeautyShareCardSvg(input);
    for (const variant of variants) {
      const blob = await svgToJpeg(svg, variant === "post" ? 1040 : 900, variant === "post" ? 867 : 750);
      assets.push({ language, variant, blob });
    }
  }
  return assets;
};
