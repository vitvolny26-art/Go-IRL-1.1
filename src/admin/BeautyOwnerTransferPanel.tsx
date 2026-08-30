import { useCallback, useEffect, useState } from "react";
import {
  decideBeautyOwnerTransfer,
  requestPendingBeautyOwnerTransfers,
  requestedBeautyOwnerTransferId,
  type BeautyOwnerTransferSummary,
} from "./beautyOwnerTransfers";

const display = (item: BeautyOwnerTransferSummary) => item.displayName || item.profileId;

export function BeautyOwnerTransferPanel() {
  const [items, setItems] = useState<BeautyOwnerTransferSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const requestedId = requestedBeautyOwnerTransferId();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setItems(await requestPendingBeautyOwnerTransfers()); }
    catch (cause) { setError(cause instanceof Error && cause.message === "access_denied" ? "Требуется роль superadmin." : "Не удалось загрузить запросы передачи кабинетов."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = async (item: BeautyOwnerTransferSummary, decision: "approve" | "reject") => {
    const label = decision === "approve" ? "Подтвердить" : "Отклонить";
    if (!window.confirm(`${label} передачу кабинета «${display(item)}»?\n\n${item.currentOwnerUserKey} → ${item.candidateUserKey}`)) return;
    setBusyId(item.transferId);
    setError("");
    try {
      const result = await decideBeautyOwnerTransfer(item.transferId, decision);
      if (result.status !== "approved" && result.status !== "rejected") throw new Error(result.status);
      await load();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      setError(code === "owner_changed" ? "Владелец кабинета уже изменился. Обновите список."
        : code === "profile_conflict" ? "Кандидат уже владеет другим кабинетом."
          : code === "role_conflict" ? "Роль кандидата несовместима с ролью мастера."
            : code === "candidate_unavailable" ? "Кандидат больше не активен."
              : "Решение не применено. Обновите состояние и повторите.");
    } finally { setBusyId(""); }
  };

  const ordered = requestedId
    ? [...items].sort((a, b) => Number(b.transferId === requestedId) - Number(a.transferId === requestedId))
    : items;

  return <section className="admin-login-card admin-role-invitations admin-beauty-owner-transfers">
    <div className="admin-section-heading"><div><h2>Передача кабинета мастера</h2><p>Кандидат уже подтвердил Google-аккаунт. Финальная смена владельца выполняется только superadmin.</p></div><button type="button" disabled={loading} onClick={() => void load()}>{loading ? "Загружаем…" : "Обновить"}</button></div>
    {ordered.map((item) => <article className={`admin-role-row${item.transferId === requestedId ? " is-targeted" : ""}`} key={item.transferId}>
      <div><strong>{display(item)}</strong><span>{item.currentOwnerUserKey} → {item.candidateUserKey}</span><span>Кандидат: {new Date(item.candidateClaimedAt).toLocaleString()} · до {new Date(item.expiresAt).toLocaleString()}</span></div>
      <div className="admin-master-copy-actions">
        <button type="button" disabled={busyId === item.transferId} onClick={() => void decide(item, "approve")}>{busyId === item.transferId ? "Применяем…" : "Подтвердить"}</button>
        <button className="admin-danger-button" type="button" disabled={busyId === item.transferId} onClick={() => void decide(item, "reject")}>Отклонить</button>
      </div>
    </article>)}
    {!loading && ordered.length === 0 ? <p>Ожидающих подтверждения передач нет.</p> : null}
    {error ? <div className="admin-role-invitation-error">{error}</div> : null}
  </section>;
}
