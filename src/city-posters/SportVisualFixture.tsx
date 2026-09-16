import type { CSSProperties } from "react";
import type { Language } from "../types";

type SportFixtureVariant = "for-you" | "catalog";

type SportFixtureCopy = {
  badge: string;
  type: string;
};

const copy: Record<Language, SportFixtureCopy> = {
  ru: { badge: "Тестовый визуал", type: "Футбол" },
  uk: { badge: "Тестовий візуал", type: "Футбол" },
  cs: { badge: "Testovací vizuál", type: "Fotbal" },
  en: { badge: "Visual test", type: "Football" },
  pl: { badge: "Test wizualny", type: "Piłka nożna" },
  sk: { badge: "Testovací vizuál", type: "Futbal" },
};

const baseCardStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  border: "1px solid rgba(201, 255, 61, 0.22)",
  background: "#0b0d0e",
  color: "#fff",
  boxShadow: "0 16px 36px rgba(0, 0, 0, 0.18)",
};

const mediaStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage: 'linear-gradient(180deg, rgba(3, 5, 6, 0.08) 0%, rgba(3, 5, 6, 0.22) 48%, rgba(3, 5, 6, 0.94) 100%), url("/activities/category-backgrounds/sport.webp")',
  backgroundPosition: "center",
  backgroundSize: "cover",
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

const typeStyle: CSSProperties = {
  display: "block",
  color: "rgba(255, 255, 255, 0.72)",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const forYouCardStyle: CSSProperties = {
  width: "min(92vw, 420px)",
  minHeight: "clamp(440px, 112vw, 500px)",
  borderRadius: 24,
};

const catalogCardStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  borderRadius: 22,
};

const forYouContentStyle: CSSProperties = {
  position: "absolute",
  zIndex: 2,
  right: 20,
  bottom: 22,
  left: 20,
};

const catalogContentStyle: CSSProperties = {
  position: "absolute",
  zIndex: 2,
  right: 14,
  bottom: 14,
  left: 14,
  padding: "12px 14px 13px",
  border: "1px solid rgba(255, 255, 255, 0.45)",
  borderRadius: 14,
  background: "rgba(6, 8, 9, 0.38)",
  backdropFilter: "blur(8px)",
};

const forYouTitleStyle: CSSProperties = {
  margin: 0,
  maxWidth: "12ch",
  color: "#fff",
  fontSize: "clamp(34px, 10vw, 48px)",
  fontWeight: 950,
  letterSpacing: "-0.03em",
  lineHeight: 1.02,
};

const catalogTitleStyle: CSSProperties = {
  margin: 0,
  overflow: "hidden",
  color: "#fff",
  fontSize: "clamp(24px, 7vw, 30px)",
  fontWeight: 950,
  letterSpacing: "-0.03em",
  lineHeight: 1.02,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export function SportVisualFixture({ language, variant }: { language: Language; variant: SportFixtureVariant }) {
  const t = copy[language];
  const isForYou = variant === "for-you";
  const className = `city-posters-sport-fixture city-posters-sport-fixture--${variant}`;
  const articleStyle = { ...baseCardStyle, ...(isForYou ? forYouCardStyle : catalogCardStyle) };
  const contentStyle = isForYou ? forYouContentStyle : catalogContentStyle;
  const titleStyle = isForYou ? forYouTitleStyle : catalogTitleStyle;

  return (
    <article className={className} style={articleStyle} aria-label="Sport visual fixture">
      <div className="city-posters-sport-fixture__media" style={mediaStyle} aria-hidden="true" />
      <span className="city-posters-sport-fixture__badge" style={badgeStyle}>{t.badge}</span>
      <div className="city-posters-sport-fixture__content" style={contentStyle}>
        <span
          className="city-posters-sport-fixture__type"
          style={{ ...typeStyle, marginBottom: isForYou ? 8 : 5, fontSize: isForYou ? 13 : 11 }}
        >
          {t.type}
        </span>
        <h2 style={titleStyle}>Оломоуц — Прага</h2>
      </div>
    </article>
  );
}
