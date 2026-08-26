import type { CSSProperties } from "react";
import { resolveEventArtworkCode } from "../../api/_shared/event-artwork.js";
import { getEventBackground, getEventSheetBackground } from "../eventBackgrounds";
import "../event-catalog-share-card.css";
import "../event-discover-sheet-card.css";

type Props={icon:string;activity:string;title:string};

export function EventCardArtwork({icon,activity,title}:Props){
  const code=resolveEventArtworkCode({icon,activity,title});
  const src=getEventBackground(code);
  const discoverSrc=getEventSheetBackground(code);
  return <div
    className={`glass-event-card-artwork artwork-${code.toLowerCase()}`}
    aria-hidden="true"
    style={src?{
      "--event-share-background":`url("${src}")`,
      "--event-discover-background":`url("${discoverSrc || src}")`,
    } as CSSProperties:undefined}
  >{src?<img className="glass-event-card-artwork-image" src={src} alt="" decoding="async"/>:<span className="glass-event-card-artwork-fallback">{icon||"✨"}</span>}</div>;
}
