import { useEffect, useState } from "react";
import {
  getCurrentDisplayName,
  initializeTrustedAuth,
  isTrustedAuthReady,
  trustedAuthSessionChangedEvent,
} from "../authSession";
import { beginGoogleWebAuth } from "../auth/googleWebAuth";
import {
  normalizeCoachInvitationCode,
  readRememberedCoachInvitationCode,
  rememberCoachInvitationCode,
  previewCoachInvitation,
  submitInvitedCoachOffer,
  type CoachInvitationPreview,
} from "../coachInvitation";

const telegramBot = String(import.meta.env.VITE_GO_IRL_BOT_USERNAME || "GOirl_bot").replace(/^@/, "");
const telegramApp = String(import.meta.env.VITE_GO_IRL_APP_NAME || "").replace(/^\/+|\/+$/g, "");
const telegramUrl = "https://t.me/" + telegramBot + (telegramApp ? "/" + telegramApp : "") + "?startapp=coach-invite";

const readInvitationCode = () => {
  const code = normalizeCoachInvitationCode(window.location.hash);
  if (code) {
    rememberCoachInvitationCode(code, window.sessionStorage);
    window.history.replaceState(window.history.state, "", "/coach-invite");
  }
  return code || readRememberedCoachInvitationCode(window.sessionStorage);
};

export function CoachInvitationLanding() {
  const [code, setCode] = useState(readInvitationCode);
  const [codeInput, setCodeInput] = useState(() => readInvitationCode() || "");
  const [authed, setAuthed] = useState(isTrustedAuthReady);
  const [preview, setPreview] = useState<CoachInvitationPreview | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    const syncAuth = () => { if (live) setAuthed(isTrustedAuthReady()); };
    window.addEventListener(trustedAuthSessionChangedEvent, syncAuth);
    void initializeTrustedAuth().then(() => {
      if (!live) return;
      setAuthed(isTrustedAuthReady());
      setName(getCurrentDisplayName("Тренер").slice(0, 80));
      setLoading(false);
    }).catch(() => { if (live) setLoading(false); });
    return () => {
      live = false;
      window.removeEventListener(trustedAuthSessionChangedEvent, syncAuth);
    };
  }, []);

  useEffect(() => {
    if (!code || !authed) { setPreview(null); return; }
    let live = true;
    setLoading(true);
    void previewCoachInvitation(code).then((result) => {
      if (!live) return;
      setPreview(result);
      setError("");
    }).catch(() => {
      if (live) { setPreview(null); setError("Приглашение недействительно, отозвано или срок его действия истёк."); }
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [code, authed, refresh]);

  const applyCode = () => {
    const normalized = normalizeCoachInvitationCode(codeInput);
    if (!normalized) { setError("Нужен полный код приглашения из ссылки."); return; }
    rememberCoachInvitationCode(normalized, window.sessionStorage);
    setCode(normalized);
    setError("");
    setRefresh((previous) => previous + 1);
  };

  const respond = async () => {
    if (!code || busy || name.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      await submitInvitedCoachOffer(code, name);
      setRefresh((previous) => previous + 1);
    } catch {
      setError("Не удалось откликнуться. Проверьте роль тренера, актуальность приглашения и попробуйте ещё раз.");
    } finally { setBusy(false); }
  };

  const copyCode = async () => {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setCopied(true); }
    catch { setError("Выделите код в поле и скопируйте вручную."); }
  };

  return (
    <main className="app" style={{ padding: "20px 14px", maxWidth: 520, margin: "0 auto" }}>
      <section className="coach-panel" aria-label="Персональное приглашение тренера">
        <div className="coach-panel-header"><div style={{ gridColumn: "1 / -1" }}><h2>Приглашение тренеру</h2></div></div>
        {!code && (
          <div className="coach-panel-fields">
            <p>Откройте ссылку, которую прислал организатор, или вставьте код приглашения.</p>
            <label>Код приглашения
              <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)}
                placeholder="Вставьте код" autoCapitalize="off" autoComplete="off" spellCheck={false} />
            </label>
            <button type="button" className="coach-panel-button" onClick={applyCode}>Открыть приглашение</button>
          </div>
        )}
        {code && !authed && !loading && (
          <div className="coach-panel-fields">
            <p>Чтобы посмотреть закрытое предложение, войдите в GO IRL. Данные события остаются закрытыми для посторонних.</p>
            <button type="button" className="coach-panel-button"
              onClick={() => { void beginGoogleWebAuth(window.location.origin + "/coach-invite").catch(() => setError("Не удалось начать вход.")); }}>
              Войти через Google
            </button>
            <label>Код для входа через Telegram
              <input value={code} readOnly onFocus={(e) => e.target.select()} />
            </label>
            <button type="button" className="coach-panel-cancel-button" onClick={() => void copyCode()}>
              {copied ? "Код скопирован" : "Скопировать код"}
            </button>
            <a href={telegramUrl}>Открыть GO IRL в Telegram</a>
            <p>После открытия приложения в Telegram вставьте скопированный код в экран приглашения.</p>
          </div>
        )}
        {loading && <p role="status">Проверяем приглашение…</p>}
        {preview && authed && !loading && (
          <div className="coach-panel-fields">
            <strong>{preview.title}</strong>
            <p>Вид спорта: {preview.sportType}</p>
            <p>Город: {preview.cityId} · Дата: {preview.date} · Время: {String(preview.time).slice(0, 5)}</p>
            <p>Участников: {preview.participantCount}</p>
            {preview.offerStatus === "accepted" && <p role="status">Вы назначены тренером этого события.</p>}
            {preview.offerStatus === "accepted" && preview.address && <p>Место встречи: {preview.address}</p>}
            {preview.offerStatus === "pending" && <p role="status">Отклик отправлен. Ожидается подтверждение организатора.</p>}
            {preview.offerStatus === "declined" && <p>Организатор отклонил отклик.</p>}
            {preview.canOffer && (
              <>
                <label>Ваше имя для организатора
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
                </label>
                <button className="coach-panel-button" type="button"
                  disabled={busy || name.trim().length < 2} onClick={() => void respond()}>
                  {busy ? "Отправка…" : "Готов провести"}
                </button>
              </>
            )}
            {!preview.canOffer && preview.offerStatus === "none" && (
              <p>Для отклика нужна сохранённая роль «Тренер → Могу помочь» или «Профессионал», а поиск тренера должен быть открыт.</p>
            )}
            <button className="coach-panel-cancel-button" type="button" onClick={() => setRefresh((x) => x + 1)}>
              Обновить статус
            </button>
            <a href="/profile">Профиль GO IRL</a>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}
