import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  parseBeautyMasterApprovedPayload,
  prepareBeautyMasterOnboarding,
  type PreparedBeautyMasterOnboarding,
} from "./beautyMasterOnboarding";
import {
  preferredBeautyMasterPayloadJson,
  requestBeautyMasterRequests,
  requestedBeautyMasterRequestId,
  type BeautyMasterRequestSummary,
} from "./beautyMasterRequests";

const errorCopy = (error: unknown) => {
  const code = error instanceof Error ? error.message : "";
  if (code.includes("beauty_master_requests")) return "Не удалось загрузить заявки мастеров. Проверьте admin session и read-only intake integration.";
  if (code.includes("trusted_session_required")) return "Сессия администратора больше не подтверждена. Откройте админ-панель заново.";
  if (code.includes("invalid_json")) return "JSON не читается. Вставьте только валидный JSON без Markdown.";
  if (code.includes("invalid_request_id")) return "Выбранная заявка содержит некорректный Request ID.";
  if (code.includes("incomplete_translations")) return "В переводе должны присутствовать RU / UK / CS / EN / PL / SK для всех обязательных полей.";
  if (code.includes("approval_conflict")) return "Для этой заявки уже подготовлен другой утверждённый snapshot. Изменение после Approve запрещено.";
  if (code.includes("already_claimed")) return "Эта заявка уже была получена мастером.";
  if (code.includes("invalid_services") || code.includes("invalid_portfolio") || code.includes("invalid_availability") || code.includes("invalid_contract")) return "JSON не соответствует контракту заявки. Проверьте профиль, услуги, портфолио и расписание.";
  return "Не удалось подготовить кабинет. Проверьте сессию администратора и backend contract.";
};

const requestLabel = (request: BeautyMasterRequestSummary) => {
  const identity = request.publicName || request.requestId;
  return [identity, request.profession, request.city, request.status, request.submittedAt].filter(Boolean).join(" · ");
};

export function BeautyMasterOnboardingPanel() {
  const [requests, setRequests] = useState<BeautyMasterRequestSummary[]>([]);
  const [requestId, setRequestId] = useState("");
  const [approvedJson, setApprovedJson] = useState("");
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<PreparedBeautyMasterOnboarding | null>(null);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState<"" | "link" | "message">("");

  const selectRequest = (nextRequestId: string, source = requests) => {
    setRequestId(nextRequestId);
    const selected = source.find((request) => request.requestId === nextRequestId);
    setApprovedJson(selected ? preferredBeautyMasterPayloadJson(selected) : "");
    setPrepared(null);
    setCopyState("");
  };

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    setError("");
    try {
      const loaded = await requestBeautyMasterRequests();
      setRequests(loaded);
      const requestedId = requestedBeautyMasterRequestId();
      const nextRequestId = loaded.some((request) => request.requestId === requestedId) ? requestedId : loaded[0]?.requestId || "";
      setRequestId(nextRequestId);
      const selected = loaded.find((request) => request.requestId === nextRequestId);
      setApprovedJson(selected ? preferredBeautyMasterPayloadJson(selected) : "");
      setPrepared(null);
      setCopyState("");
    } catch (cause) {
      setError(errorCopy(cause));
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPreparing(true);
    setPrepared(null);
    setError("");
    setCopyState("");
    try {
      const payload = parseBeautyMasterApprovedPayload(approvedJson);
      setPrepared(await prepareBeautyMasterOnboarding(requestId, payload));
    } catch (cause) {
      setError(errorCopy(cause));
    } finally {
      setPreparing(false);
    }
  };

  const copy = async (kind: "link" | "message") => {
    if (!prepared) return;
    try {
      await navigator.clipboard.writeText(kind === "link" ? prepared.claimUrl : prepared.masterMessage);
      setCopyState(kind);
    } catch {
      setError("Не удалось скопировать текст в буфер обмена.");
    }
  };

  const selectedRequest = requests.find((request) => request.requestId === requestId) || null;

  return <section className="admin-tab-panel admin-tab-stack">
    <section className="admin-login-card admin-role-invitations admin-master-onboarding">
      <div className="admin-section-heading">
        <div>
          <h2>Заявка мастера → кабинет</h2>
          <p>Выберите активную заявку. Request ID подставляется автоматически; готовый перевод из intake также загрузится автоматически, если он уже есть.</p>
        </div>
        <button type="button" onClick={() => void loadRequests()} disabled={loadingRequests || preparing}>{loadingRequests ? "Загружаем…" : "Обновить заявки"}</button>
      </div>
      <form onSubmit={submit}>
        <label>
          <span>Заявка мастера</span>
          <select value={requestId} onChange={(event: ChangeEvent<HTMLSelectElement>) => selectRequest(event.target.value)} disabled={loadingRequests || preparing || requests.length === 0}>
            {requests.length === 0 ? <option value="">Активных заявок нет</option> : null}
            {requests.map((request) => <option key={request.requestId} value={request.requestId}>{requestLabel(request)}</option>)}
          </select>
        </label>
        {selectedRequest ? <div className="admin-role-invitation-result">
          <strong>{selectedRequest.publicName || "Без публичного имени"}</strong>
          <span>{selectedRequest.requestId}</span>
          <span>{[selectedRequest.profession, selectedRequest.city, selectedRequest.sourceLanguage, selectedRequest.status].filter(Boolean).join(" · ")}</span>
        </div> : null}
        <label><span>Утверждённый JSON · RU / UK / CS / EN / PL / SK</span><textarea rows={16} value={approvedJson} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setApprovedJson(event.target.value)} placeholder={selectedRequest ? "Для этой заявки перевод ещё не загружен. Вставьте утверждённый JSON." : "Сначала выберите заявку."} spellCheck={false} disabled={preparing || !selectedRequest} /></label>
        <button type="submit" disabled={preparing || !requestId || !approvedJson.trim()}>{preparing ? "Подготавливаем…" : "Approve · подготовить кабинет"}</button>
      </form>
      {prepared ? <div className="admin-role-invitation-result admin-master-onboarding-result">
        <strong>Кабинет подготовлен</strong>
        <span>Ссылка действует до {new Date(prepared.expiresAt).toLocaleString()} и предназначена для одного успешного claim.</span>
        <input readOnly value={prepared.claimUrl} aria-label="Одноразовая ссылка мастеру" />
        <div className="admin-master-copy-actions">
          <button type="button" onClick={() => void copy("link")}>{copyState === "link" ? "Ссылка скопирована" : "Скопировать ссылку"}</button>
          <button type="button" onClick={() => void copy("message")}>{copyState === "message" ? "Сообщение скопировано" : "Скопировать сообщение мастеру"}</button>
        </div>
      </div> : null}
      {error ? <div className="admin-role-invitation-error">{error}</div> : null}
    </section>
  </section>;
}
