import { useEffect, useState } from "react";

type MovieCandidate = {
  movie_id: string;
  movie_title: string;
  score: number;
  screening_count: number;
  day_count: number;
  reasons: Record<string, unknown>;
  poster_url: string;
};

type Preview = {
  approval: { id: string; status: string; expiresAt: string | null; weekStart: string | null; weekEnd: string | null };
  venue: { name: string; cityId: string };
  movie: MovieCandidate;
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
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

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
    }).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить кандидата.");
    }).finally(() => setBusy(false));
  }, []);

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
        body: JSON.stringify({ token, decision }),
      }));
      setDone(decision === "approve" ? "approved" : "rejected");
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
        <div className="cinema-approval-result-icon">{done === "approved" ? "✓" : "—"}</div>
        <h1>{done === "approved" ? "Фильм подтверждён" : "Фильм пропущен"}</h1>
        <p>Решение сохранено. Следующий кандидат придёт отдельным сообщением в Telegram.</p>
        <button type="button" className="cinema-approval-primary" onClick={() => telegramWebApp()?.close?.()}>Закрыть</button>
      </section>
    </main>;
  }

  return <main className="cinema-approval-shell">
    <header className="cinema-approval-header">
      <span className="cinema-approval-kicker">GO IRL · Сити Афиша</span>
      <h1>Кандидат кино</h1>
      {preview ? <p>{preview.venue.name} · {rangeLabel(preview.approval.weekStart, preview.approval.weekEnd)}</p> : null}
    </header>

    {busy && !preview ? <div className="cinema-approval-state">Загружаю кандидата…</div> : null}
    {error ? <div className="cinema-approval-error" role="alert">{error}</div> : null}

    {preview ? <>
      <section className="cinema-approval-section">
        <div className="cinema-approval-section-heading">
          <div><span className="cinema-approval-kicker">Сити Афиша → Кино</span><h2>{preview.movie.movie_title}</h2></div>
        </div>
        <p className="cinema-approval-help">Одно сообщение — один фильм. Подтвердите или пропустите только этого кандидата.</p>
        <div className="cinema-approval-list">
          <article className="cinema-approval-choice cinema-approval-movie">
            <span className="cinema-approval-choice-poster" aria-hidden="true">
              <img src={preview.movie.poster_url} alt="" loading="eager" decoding="async" referrerPolicy="no-referrer" />
            </span>
            <span className="cinema-approval-choice-body">
              <span className="cinema-approval-choice-title">{preview.movie.movie_title}</span>
              <span className="cinema-approval-choice-meta">score {preview.movie.score} · {preview.movie.day_count} дн. · {preview.movie.screening_count} сеанс.</span>
              {movieTags(preview.movie).length ? <span className="cinema-approval-tags">{movieTags(preview.movie).map((tag) => <em key={tag}>{tag}</em>)}</span> : null}
            </span>
          </article>
        </div>
      </section>

      <footer className="cinema-approval-actions">
        <button type="button" className="cinema-approval-primary" disabled={busy} onClick={() => void decide("approve")}>
          {busy ? "Сохраняю…" : "Подтвердить фильм"}
        </button>
        <button type="button" className="cinema-approval-secondary" disabled={busy} onClick={() => void decide("reject")}>Пропустить фильм</button>
      </footer>
    </> : null}
  </main>;
}
