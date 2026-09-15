import { useEffect, useMemo, useState } from "react";

type MovieCandidate = {
  movie_id: string;
  movie_title: string;
  score: number;
  screening_count: number;
  day_count: number;
  reasons: Record<string, unknown>;
  selected: boolean;
  week_start: string;
  week_end: string;
};

type PromotionCandidate = {
  promotion_key: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  promo_price: number | null;
  currency: string;
  discount_text: string | null;
  terms: string | null;
  source_url: string;
  selected: boolean;
};

type Preview = {
  approval: {
    id: string;
    status: string;
    expiresAt: string | null;
    weekStart: string | null;
    weekEnd: string | null;
  };
  venue: { name: string; cityId: string };
  movies: MovieCandidate[];
  promotions: PromotionCandidate[];
};

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  HapticFeedback?: {
    notificationOccurred?: (type: "success" | "error" | "warning") => void;
  };
};

const telegramWebApp = () => (window as typeof window & {
  Telegram?: { WebApp?: TelegramWebApp };
}).Telegram?.WebApp;

const params = () => new URLSearchParams(window.location.search);
const token = () => params().get("token") || "";
const rejectToken = () => params().get("rejectToken") || "";

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
};

const weekLabel = (start: string | null, end: string | null) => start && end
  ? `${formatDate(start)} — ${formatDate(end)}`
  : "следующая неделя";

const reasonLabels = (candidate: MovieCandidate) => {
  const reasons = candidate.reasons || {};
  const labels: string[] = [];
  if (reasons.has4k === true) labels.push("4K");
  if (reasons.hasDolby === true) labels.push("Dolby Atmos");
  if (reasons.has3d === true) labels.push("3D");
  if (reasons.hasDbox === true) labels.push("D-BOX");
  if (reasons.hasOriginal === true) labels.push("Original");
  if (typeof reasons.imdbRating === "number") labels.push(`IMDb ${reasons.imdbRating}`);
  return labels;
};

const readJson = async <T,>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => null) as T | null;
  if (!response.ok || !payload) {
    const code = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error?: unknown }).error || "request_failed")
      : `http_${response.status}`;
    throw new Error(code);
  }
  return payload;
};

export function CinemaApprovalPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedMovies, setSelectedMovies] = useState<Set<string>>(new Set());
  const [selectedPromotions, setSelectedPromotions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"applied" | "rejected" | null>(null);

  useEffect(() => {
    const webApp = telegramWebApp();
    webApp?.ready?.();
    webApp?.expand?.();

    const approvalToken = token();
    if (!/^[0-9a-f]{64}$/i.test(approvalToken)) {
      setError("Ссылка подтверждения недействительна.");
      setLoading(false);
      return;
    }

    void readJson<{ ok: true } & Preview>(
      awaitFetch(`/api/cinema/approval?mode=preview&token=${encodeURIComponent(approvalToken)}`),
    ).then((payload) => {
      setPreview(payload);
      setSelectedMovies(new Set(payload.movies.filter((movie) => movie.selected).map((movie) => movie.movie_id)));
      setSelectedPromotions(new Set(payload.promotions.filter((promotion) => promotion.selected).map((promotion) => promotion.promotion_key)));
    }).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить подборку.");
    }).finally(() => setLoading(false));
  }, []);

  const selectionSummary = useMemo(() => {
    if (!preview) return "";
    return `${selectedMovies.size} фильм${selectedMovies.size === 1 ? "" : "ов"} · ${selectedPromotions.size} акц.`;
  }, [preview, selectedMovies, selectedPromotions]);

  const toggle = (current: Set<string>, value: string, setter: (next: Set<string>) => void) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  const submit = async (decision: "approve" | "reject") => {
    const approvalToken = decision === "approve" ? token() : rejectToken();
    if (!/^[0-9a-f]{64}$/i.test(approvalToken)) {
      setError("Токен решения недействителен. Откройте последнее сообщение GO IRL.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/cinema/approval?mode=decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: approvalToken,
          decision,
          movieIds: decision === "approve" ? [...selectedMovies] : [],
          promotionKeys: decision === "approve" ? [...selectedPromotions] : [],
        }),
      });
      await readJson<{ ok: boolean; state: string }>(Promise.resolve(response));
      setResult(decision === "approve" ? "applied" : "rejected");
      telegramWebApp()?.HapticFeedback?.notificationOccurred?.("success");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Решение не применено.");
      telegramWebApp()?.HapticFeedback?.notificationOccurred?.("error");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <main className="cinema-approval-shell">
        <section className="cinema-approval-result" aria-live="polite">
          <div className="cinema-approval-result-icon">{result === "applied" ? "✓" : "—"}</div>
          <h1>{result === "applied" ? "Подборка опубликована" : "Публикация отменена"}</h1>
          <p>{result === "applied"
            ? "Выбранные фильмы появятся в Сити Афиша → Кино. Выбранные скидочные акции создаются как Activity Кино."
            : "Фильмы и акции из этой подборки не публикуются."}</p>
          <button type="button" className="cinema-approval-primary" onClick={() => telegramWebApp()?.close?.()}>
            Закрыть
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="cinema-approval-shell">
      <header className="cinema-approval-header">
        <span className="cinema-approval-kicker">GO IRL · Сити Афиша</span>
        <h1>Кино на следующую неделю</h1>
        {preview ? <p>{preview.venue.name} · {weekLabel(preview.approval.weekStart, preview.approval.weekEnd)}</p> : null}
      </header>

      {loading ? <div className="cinema-approval-state">Загружаю подборку…</div> : null}
      {error ? <div className="cinema-approval-error" role="alert">{error}</div> : null}

      {!loading && preview ? (
        <>
          <section className="cinema-approval-section">
            <div className="cinema-approval-section-heading">
              <div>
                <span className="cinema-approval-kicker">Сити Афиша → Кино</span>
                <h2>Лучшие фильмы</h2>
              </div>
              <strong>{selectedMovies.size}/{preview.movies.length}</strong>
            </div>
            <p className="cinema-approval-help">Все сеансы остаются в расписании. Публично показываем только отмеченные фильмы.</p>
            <div className="cinema-approval-list">
              {preview.movies.length ? preview.movies.map((movie, index) => {
                const labels = reasonLabels(movie);
                return (
                  <label className="cinema-approval-choice" key={movie.movie_id}>
                    <input
                      type="checkbox"
                      checked={selectedMovies.has(movie.movie_id)}
                      disabled={submitting}
                      onChange={() => toggle(selectedMovies, movie.movie_id, setSelectedMovies)}
                    />
                    <span className="cinema-approval-choice-body">
                      <span className="cinema-approval-choice-title"><b>{index + 1}.</b> {movie.movie_title}</span>
                      <span className="cinema-approval-choice-meta">
                        score {movie.score} · {movie.day_count} дн. · {movie.screening_count} сеанс.
                      </span>
                      {labels.length ? <span className="cinema-approval-tags">{labels.map((label) => <em key={label}>{label}</em>)}</span> : null}
                    </span>
                  </label>
                );
              }) : <div className="cinema-approval-empty">На следующую неделю фильмов нет.</div>}
            </div>
          </section>

          <section className="cinema-approval-section">
            <div className="cinema-approval-section-heading">
              <div>
                <span className="cinema-approval-kicker">Activity · Кино</span>
                <h2>Акции со скидкой</h2>
              </div>
              <strong>{selectedPromotions.size}/{preview.promotions.length}</strong>
            </div>
            <p className="cinema-approval-help">Только скидочные акции. Одна акция создаёт одну Activity, не Activity на каждый фильм.</p>
            <div className="cinema-approval-list">
              {preview.promotions.length ? preview.promotions.map((promotion) => (
                <label className="cinema-approval-choice cinema-approval-promotion" key={promotion.promotion_key}>
                  <input
                    type="checkbox"
                    checked={selectedPromotions.has(promotion.promotion_key)}
                    disabled={submitting}
                    onChange={() => toggle(selectedPromotions, promotion.promotion_key, setSelectedPromotions)}
                  />
                  <span className="cinema-approval-choice-body">
                    <span className="cinema-approval-choice-title">{promotion.title}</span>
                    <span className="cinema-approval-choice-meta">
                      {weekLabel(promotion.start_date, promotion.end_date)}
                      {promotion.promo_price !== null ? ` · ${promotion.promo_price} ${promotion.currency}` : ""}
                    </span>
                    {promotion.discount_text ? <span className="cinema-approval-discount">{promotion.discount_text}</span> : null}
                    <a href={promotion.source_url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                      Источник CineStar
                    </a>
                  </span>
                </label>
              )) : <div className="cinema-approval-empty">Новых скидочных акций нет.</div>}
            </div>
          </section>

          <footer className="cinema-approval-actions">
            <div className="cinema-approval-selection-summary">{selectionSummary}</div>
            <button
              type="button"
              className="cinema-approval-primary"
              disabled={submitting}
              onClick={() => void submit("approve")}
            >
              {submitting ? "Публикую…" : "Опубликовать выбранное"}
            </button>
            <button
              type="button"
              className="cinema-approval-secondary"
              disabled={submitting}
              onClick={() => void submit("reject")}
            >
              Не публиковать ничего
            </button>
          </footer>
        </>
      ) : null}
    </main>
  );
}

const awaitFetch = (url: string) => fetch(url, {
  method: "GET",
  headers: { Accept: "application/json" },
  cache: "no-store",
});
