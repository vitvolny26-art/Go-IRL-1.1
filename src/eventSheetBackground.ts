import type { CSSProperties } from "react";
import { resolveEventArtworkCode } from "../api/_shared/event-artwork.js";
import { getEventSheetBackground } from "./eventBackgrounds";

type EventSheetBackgroundInput = {
  icon?: string;
  activity?: string;
  title?: string;
};

export const getEventSheetBackgroundStyle = ({
  icon = "",
  activity = "",
  title = "",
}: EventSheetBackgroundInput): CSSProperties | undefined => {
  const code = resolveEventArtworkCode({ icon, activity, title });
  const image = getEventSheetBackground(code);

  if (!image) return undefined;

  return {
    backgroundColor: "#111319",
    backgroundImage: [
      "linear-gradient(180deg, rgba(8, 10, 14, 0.18) 0%, rgba(8, 10, 14, 0.62) 58%, #111319 100%)",
      `url("${image}")`,
      `url("${image}")`,
    ].join(", "),
    backgroundPosition: "center, center top, center top",
    backgroundRepeat: "no-repeat, no-repeat, no-repeat",
    backgroundSize: "100% 100%, contain, cover",
  };
};
