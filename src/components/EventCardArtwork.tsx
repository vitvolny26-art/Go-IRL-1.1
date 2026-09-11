import type { CSSProperties } from "react";
import { resolveEventArtworkCode } from "../../api/_shared/event-artwork.js";
import { getEventBackground, getEventSheetBackground } from "../eventBackgrounds";
import "../event-catalog-share-card.css";
import "../event-discover-sheet-card.css";
import "../festival-event-card.css";

type Props={icon:string;activity:string;title:string;backgroundUrl?:string};

export function EventCardArtwork({icon,activity,title,backgroundUrl}:Props){
  const code=resolveEventArtworkCode({icon,activity,title});
  const imported=backgroundUrl?.trim();
  const src=imported||getEventBackground(code);
  const discoverSrc=imported||getEventSheetBackground(code);
  return <div
    className={`glass-event-card-artwork artwork-${code.toLowerCase()}`}
    aria-hidden="true"
    style={src?{
      "--event-share-background":`url("${src}")`,
      "--event-discover-background":`url("${discoverSrc || src}")`,
    } as CSSProperties:undefined}
  >{src?<img className="glass-event-card-artwork-image" src={src} alt="" decoding="async" loading="lazy"/>:<span className="glass-event-card-artwork-fallback">{icon||"✨"}</span>}</div>;
}
