import type { CSSProperties } from "react";
import { resolveEventArtworkCode } from "../../api/_shared/event-artwork.js";
import { getEventBackground, getEventShareBackground } from "../eventBackgrounds";
import "../event-catalog-share-card.css";

type Props={icon:string;activity:string;title:string};

export function EventCardArtwork({icon,activity,title}:Props){
  const code=resolveEventArtworkCode({icon,activity,title});
  const src=getEventBackground(code);
  const shareSrc=getEventShareBackground(code);
  return <div
    className={`glass-event-card-artwork artwork-${code.toLowerCase()}`}
    aria-hidden="true"
    style={shareSrc?{"--event-share-background":`url("${shareSrc}")`} as CSSProperties:undefined}
  >{src?<img className="glass-event-card-artwork-image" src={src} alt="" decoding="async"/>:<span className="glass-event-card-artwork-fallback">{icon||"✨"}</span>}</div>;
}
