import type { CSSProperties, SyntheticEvent } from "react";
import type { Language } from "../types";

type CinemaFixtureVariant = "for-you" | "catalog";

type CinemaFixtureCopy = {
  badge: string;
  type: string;
  primaryAction: string;
  secondaryAction: string;
};

const copy: Record<Language, CinemaFixtureCopy> = {
  ru: { badge: "Тестовый визуал", type: "Кино", primaryAction: "Подробнее", secondaryAction: "Билеты" },
  uk: { badge: "Тестовий візуал", type: "Кіно", primaryAction: "Детальніше", secondaryAction: "Квитки" },
  cs: { badge: "Testovací vizuál", type: "Kino", primaryAction: "Detail", secondaryAction: "Vstupenky" },
  en: { badge: "Visual test", type: "Cinema", primaryAction: "Details", secondaryAction: "Tickets" },
  pl: { badge: "Test wizualny", type: "Kino", primaryAction: "Szczegóły", secondaryAction: "Bilety" },
  sk: { badge: "Testovací vizuál", type: "Kino", primaryAction: "Detail", secondaryAction: "Vstupenky" },
};

const CINEMA_FOR_YOU_POSTER = "https://olomouc.premierecinemas.cz/media/posters/mimoni-a-monstra.jpg?width=720&quality=90";
const CINEMA_FOR_YOU_FALLBACK = "/activities/sheets-9x16/12-cinema.webp";
const CINEMA_CATALOG_POSTER = "/activities/share-4x3/12-cinema.webp";

const baseCardStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  border: "1px solid rgba(201, 255, 61, 0.72)",
  background: "#0b0d0e",
  color: "#fff",
  boxShadow: "0 16px 36px rgba(0, 0, 0, 0.18)",
};

const mediaStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center",
};

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, rgba(3, 5, 6, 0.08) 0%, rgba(3, 5, 6, 0.18) 45%, rgba(3, 5, 6, 0.92) 100%)",
};

const badgeStyle: CSSProperties = {
  position: "absolute",
  top: 14,
  left: 14,
  zIndex: 2,
  padding: "7px 10px",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  borderRadius: 999,
  background: "rgba(0, 0, 0, 0.58)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1,
  backdropFilter: "blur(10px)",
};

const shareButtonStyle: CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
  zIndex: 2,
  display: "grid",
  placeItems: "center",
  width: 44,
  height: 44,
  border: "1.5px solid rgba(201, 255, 61, 0.86)",
  borderRadius: 999,
  background: "rgba(14, 18, 10, 0.68)",
  color: "#c9ff3d",
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1,
  backdropFilter: "blur(10px)",
};

const typeStyle: CSSProperties = {
  display: "block",
  color: "rgba(255, 255, 255, 0.82)",
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const forYouCardStyle: CSSProperties = { width: "min(100%, 430px)", minHeight: 560, borderRadius: 28 };
const catalogCardStyle: CSSProperties = { width: "min(100%, 360px)", minHeight: 500, borderRadius: 24 };

const contentStyle: CSSProperties = {
  position: "absolute",
  zIndex: 2,
  right: 16,
  bottom: 16,
  left: 16,
  display: "grid",
  gap: 12,
};

const forYouTitleStyle: CSSProperties = {
  margin: 0,
  maxWidth: "13ch",
  color: "#fff",
  fontSize: "clamp(34px, 10vw, 48px)",
  fontWeight: 950,
  letterSpacing: "-0.03em",
  lineHeight: 1.02,
};

const catalogTitleStyle: CSSProperties = {
  margin: 0,
  maxWidth: "13ch",
  color: "#fff",
  fontSize: "clamp(28px, 6vw, 36px)",
  fontWeight: 950,
  letterSpacing: "-0.03em",
  lineHeight: 1.02,
};

const actionRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  paddingTop: 12,
  borderTop: "1px solid rgba(255, 255, 255, 0.22)",
};

const actionButtonStyle: CSSProperties = {
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 14px",
  border: "1.5px solid rgba(201, 255, 61, 0.88)",
  borderRadius: 999,
  background: "rgba(14, 18, 10, 0.78)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 800,
  lineHeight: 1,
  whiteSpace: "nowrap",
  backdropFilter: "blur(10px)",
};

const useCinemaFallback = (event: SyntheticEvent<HTMLImageElement>) => {
  const image = event.currentTarget;
  if (image.src.endsWith(CINEMA_FOR_YOU_FALLBACK)) return;
  image.src = CINEMA_FOR_YOU_FALLBACK;
};

export function CinemaVisualFixture({ language, variant }: { language: Language; variant: CinemaFixtureVariant }) {
  const t = copy[language];
  const isForYou = variant === "for-you";
  const posterSrc = isForYou ? CINEMA_FOR_YOU_POSTER : CINEMA_CATALOG_POSTER;
  const articleStyle = { ...baseCardStyle, ...(isForYou ? forYouCardStyle : catalogCardStyle) };
  const titleStyle = isForYou ? forYouTitleStyle : catalogTitleStyle;

  return (
    <article className={`city-posters-cinema-fixture city-posters-cinema-fixture--${variant}`} style={articleStyle} aria-label="Cinema visual fixture">
      <img src={posterSrc} alt="" aria-hidden="true" style={mediaStyle} onError={isForYou ? useCinemaFallback : undefined} />
      <div aria-hidden="true" style={overlayStyle} />
      <span style={badgeStyle}>{t.badge}</span>
      <button type="button" aria-label="Share fixture" style={shareButtonStyle}>↗</button>
      <div style={contentStyle}>
        <div>
          <span style={{ ...typeStyle, marginBottom: 7, fontSize: isForYou ? 13 : 12 }}>{t.type}</span>
          <h2 style={titleStyle}>Mimoni a monstra</h2>
        </div>
        <div style={actionRowStyle}>
          <button type="button" style={actionButtonStyle}>{t.primaryAction}</button>
          <button type="button" style={actionButtonStyle}>{t.secondaryAction}</button>
        </div>
      </div>
    </article>
  );
}
