import { useState, type ChangeEvent, type FormEvent } from "react";
import {
  parseBeautyMasterApprovedPayload,
  prepareBeautyMasterOnboarding,
  type PreparedBeautyMasterOnboarding,
} from "./beautyMasterOnboarding";

const errorCopy = (error: unknown) => {
  const code = error instanceof Error ? error.message : "";
  if (code.includes("invalid_json")) return "JSON не читается. Вставьте только валидный JSON без Markdown.";
  if (code.includes("invalid_request_id")) return "Request ID должен иметь формат GROOMING018-<uuid>.";
  if (code.includes("incomplete_translations")) return "В переводе должны присутствовать RU / UK / CS / EN / PL / SK для всех обязательных полей.";
  if (code.includes("approval_conflict")) return "Для этой заявки уже подготовлен другой утверждённый snapshot. Изменение после Approve запрещено.";
  if (code.includes("already_claimed")) return "Эта заявка уже была получена мастером.";
  if (code.includes("invalid_services") || code.includes("invalid_portfolio") || code.includes("invalid_availability") || code.includes("invalid_contract")) return "JSON не соответствует контракту заявки. Проверьте профиль, услуги, портфолио и расписание.";
  return "Не удалось подготовить кабинет. Проверьте сессию администратора и backend contract.";
};

export function BeautyMasterOnboardingPanel() {
  const [requestId, setRequestId] = useState("");
  const [approvedJson, setApprovedJson] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<PreparedBeautyMasterOnboarding | null>(null);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState<"" | "link" | "message">("");

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

  return <section className="admin-tab-panel admin-tab-stack">
    <section className="admin-login-card admin-role-invitations admin-master-onboarding">
      <div className="admin-section-heading">
        <div>
          <h2>Заявка мастера → кабинет</h2>
          <p>После проверки заявки и AI-перевода вставьте утверждённый JSON. Approve создаёт только одноразовую claim-ссылку; публикация остаётся за мастером.</p>
        </div>
      </div>
      <form onSubmit={submit}>
        <label><span>Request ID</span><input value={requestId} onChange={(event: ChangeEvent<HTMLInputElement>) => setRequestId(event.target.value)} placeholder="GROOMING018-…" autoComplete="off" disabled={preparing} /></label>
        <label><span>Утверждённый JSON · RU / UK / CS / EN / PL / SK</span><textarea rows={16} value={approvedJson} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setApprovedJson(event.target.value)} placeholder="{ … }" spellCheck={false} disabled={preparing} /></label>
        <button type="submit" disabled={preparing || !requestId.trim() || !approvedJson.trim()}>{preparing ? "Подготавливаем…" : "Approve · подготовить кабинет"}</button>
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
