import { useEffect, useMemo, useState } from "react";

type MovieCandidate = {
  movie_id: string;
  movie_title: string;
  score: number;
  screening_count: number;
  day_count: number;
  reasons: Record<string, unknown>;
  selected: boolean;
  poster_url: string | null;
};

type PromotionCandidate = {
  promotion_key: string;
  title: string;
  start_date: string;
  end_date: string;
  promo_price: number | null;
  currency: string;
  discount_text: string | null;
  source_url: string;
  selected: boolean;
};

type Preview = {
  approval: { id: string; status: string; expiresAt: string | null; weekStart: string | null; weekEnd: string | null };
  venue: { name: string; cityId: string };
  movies: MovieCandidate[];
  promotions: PromotionCandidate[];
};

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  HapticFeedback?: { notificationOccurred?: (type: "success" | "error" | "warning") => void };
};

const telegramWebApp = () => (window as typeof window & {
  Telegram?: { WebApp?: TelegramWebApp };
}).Telegram?.WebApp;

const query = () => new URLSearchParams(window.location.search);
const approveToken = () => query().get("token") || "";
const declineToken = () => query().get("rejectToken") || "";
const isToken = (value: string) => /^[0-9a-f]{64}$/i.test(value);

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
};

const rangeLabel = (start: string | null, end: string | null) => start && end
  ? `${formatDate(start)} — ${formatDate(end)}`
  : "следующая неделя";

const readJson = async <T,>(input: Response | Promise<Response>): Promise<T> => {
  const response = await input;
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error || `http_${response.status}`);
  return payload;
};

const movieTags = (movie: MovieCandidate) => {
  const tags: string[] = [];
  if (movie.reasons?.has4k === true) tags.push("4K");
  if (movie.reasons?.hasDolby === true) tags.push("Dolby Atmos");
  if (movie.reasons?.has3d === true) tags.push("3D");
  if (movie.reasons?.hasDbox === true) tags.push("D-BOX");
  if (movie.reasons?.hasOriginal === true) tags.push("Original");
  if (typeof movie.reasons?.imdbRating === "number") tags.push(`IMDb ${movie.reasons.imdbRating}`);
  return tags;
};

export function CinemaApprovalPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [movies, setMovies] = useState<Set<string>>(new Set());
  const [promotions, setPromotions] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"applied" | "rejected" | null>(null);

  useEffect(() => {
    telegramWebApp()?.ready?.();
    telegramWebApp()?.expand?.();
    const token = approveToken();
    if (!isToken(token)) {
      setError("Ссылка подтверждения недействительна.");
      setBusy(false);
      return;
    }

    void readJson<{ ok: true } & Preview>(fetch(
      `/api/cinema/approval?mode=preview&token=${encodeURIComponent(token)}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    )).then((payload) => {
      setPreview(payload);
      setMovies(new Set(payload.movies.filter((item) => item.selected).map((item) => item.movie_id)));
      setPromotions(new Set(payload.promotions.filter((item) => item.selected).map((item) => item.promotion_key)));
    }).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить подборку.");
    }).finally(() => setBusy(false));
  }, []);

  const summary = useMemo(() => `${movies.size} фильм. · ${promotions.size} акц.`, [movies, promotions]);

  const toggle = (set: Set<string>, key: string, update: (value: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    update(next);
  };

  const decide = async (decision: "approve" | "reject") => {
    const token = decision === "approve" ? approveToken() : declineToken();
    if (!isToken(token)) {
      setError("Токен решения недействителен. Откройте последнее сообщение GO IRL.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await readJson<{ ok: boolean; state: string }>(fetch("/api/cinema/approval?mode=decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          decision,
          movieIds: decision === "approve" ? [...movies] : [],
          promotionKeys: decision === "approve" ? [...promotions] : [],
        }),
      }));
      setDone(decision === "approve" ? "applied" : "rejected");
      telegramWebApp()?.HapticFeedback?.notificationOccurred?.("success");
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Решение не применено.");
      telegramWebApp()?.HapticFeedback?.notificationOccurred?.("error");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return <main className="cinema-approval-shell">
      <section className="cinema-approval-result" aria-live="polite">
        <div className="cinema-approval-result-icon">{done === "applied" ? "✓" : "—"}</div>
        <h1>{done === "applied" ? "Подборка опубликована" : "Публикация отменена"}</h1>
        <p>{done === "applied"
          ? "Выбранные фильмы опубликованы в Сити Афиша → Кино, выбранные скидочные акции — как Activity Кино."
          : "Фильмы и акции из этой подборки не публикуются."}</p>
        <button type="button" className="cinema-approval-primary" onClick={() => telegramWebApp()?.close?.()}>Закрыть</button>
      </section>
    </main>;
  }

  return <main className="cinema-approval-shell">
    <header className="cinema-approval-header">
      <span className="cinema-approval-kicker">GO IRL · Сити Афиша</span>
      <h1>Кино на следующую неделю</h1>
      {preview ? <p>{preview.venue.name} · {rangeLabel(preview.approval.weekStart, preview.approval.weekEnd)}</p> : null}
    </header>

    {busy && !preview ? <div className="cinema-approval-state">Загружаю подборку…</div> : null}
    {error ? <div className="cinema-approval-error" role="alert">{error}</div> : null}

    {preview ? <>
      <section className="cinema-approval-section">
        <div className="cinema-approval-section-heading">
          <div><span className="cinema-approval-kicker">Сити Афиша → Кино</span><h2>Лучшие фильмы</h2></div>
          <strong>{movies.size}/{preview.movies.length}</strong>
        </div>
        <p className="cinema-approval-help">Все сеансы остаются в расписании. Публично показываем только отмеченные фильмы.</p>
        <div className="cinema-approval-list">
          {preview.movies.length ? preview.movies.map((movie, index) => <label className="cinema-approval-choice cinema-approval-movie" key={movie.movie_id}>
            <input type="checkbox" checked={movies.has(movie.movie_id)} disabled={busy} onChange={() => toggle(movies, movie.movie_id, setMovies)} />
            <span className="cinema-approval-choice-poster" aria-hidden="true">
              {movie.poster_url
                ? <img src={movie.poster_url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                : <span className="cinema-approval-choice-poster-fallback">🎬</span>}
            </span>
            <span className="cinema-approval-choice-body">
              <span className="cinema-approval-choice-title"><b>{index + 1}.</b> {movie.movie_title}</span>
              <span className="cinema-approval-choice-meta">score {movie.score} · {movie.day_count} дн. · {movie.screening_count} сеанс.</span>
              {movieTags(movie).length ? <span className="cinema-approval-tags">{movieTags(movie).map((tag) => <em key={tag}>{tag}</em>)}</span> : null}
            </span>
          </label>) : <div className="cinema-approval-empty">На следующую неделю фильмов нет.</div>}
        </div>
      </section>

      <section className="cinema-approval-section">
        <div className="cinema-approval-section-heading">
          <div><span className="cinema-approval-kicker">Activity · Кино</span><h2>Акции со скидкой</h2></div>
          <strong>{promotions.size}/{preview.promotions.length}</strong>
        </div>
        <p className="cinema-approval-help">Только скидочные акции. Одна акция создаёт одну Activity, не Activity на каждый фильм.</p>
        <div className="cinema-approval-list">
          {preview.promotions.length ? preview.promotions.map((promotion) => <label className="cinema-approval-choice cinema-approval-promotion" key={promotion.promotion_key}>
            <input type="checkbox" checked={promotions.has(promotion.promotion_key)} disabled={busy} onChange={() => toggle(promotions, promotion.promotion_key, setPromotions)} />
            <span className="cinema-approval-choice-body">
              <span className="cinema-approval-choice-title">{promotion.title}</span>
              <span className="cinema-approval-choice-meta">{rangeLabel(promotion.start_date, promotion.end_date)}{promotion.promo_price !== null ? ` · ${promotion.promo_price} ${promotion.currency}` : ""}</span>
              {promotion.discount_text ? <span className="cinema-approval-discount">{promotion.discount_text}</span> : null}
              <a href={promotion.source_url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Источник CineStar</a>
            </span>
          </label>) : <div className="cinema-approval-empty">Новых скидочных акций нет.</div>}
        </div>
      </section>

      <footer className="cinema-approval-actions">
        <div className="cinema-approval-selection-summary">{summary}</div>
        <button type="button" className="cinema-approval-primary" disabled={busy} onClick={() => void decide("approve")}>
          {busy ? "Публикую…" : "Опубликовать выбранное"}
        </button>
        <button type="button" className="cinema-approval-secondary" disabled={busy} onClick={() => void decide("reject")}>Не публиковать ничего</button>
      </footer>
    </> : null}
  </main>;
}
