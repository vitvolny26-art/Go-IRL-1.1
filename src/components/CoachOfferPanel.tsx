import { useCallback, useEffect, useState } from "react";
import type { Activity } from "../types";
import { getCurrentCoachUserKey } from "../coachFeature";
import { buildCoachInvitationUrl, createCoachInvitation, revokeCoachInvitation } from "../coachInvitation";
import { isTrustedAuthReady, trustedAuthSessionChangedEvent } from "../authSession";
import {
  acceptCoachOffer,
  canOfferAsCoach,
  closeCoachOffer,
  getPublicCoachState,
  loadCoachOffers,
  offerAsCoach,
  type CoachOffer,
  type CoachPublicState,
} from "../coachOffers";

const coachRequestsChangedEvent = "go-irl-coach-requests-changed";

export function CoachOfferPanel({ activity }: { activity: Activity }) {
  const [actor, setActor] = useState<string | null>(null);
  const [offers, setOffers] = useState<CoachOffer[]>([]);
  const [coachState, setCoachState] = useState<CoachPublicState>("none");
  const [canOffer, setCanOffer] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const organizer = Boolean(actor && actor === activity.organizerKey);
  const myOffer = offers.find((offer) => offer.candidateUserKey === actor);
  const offerIsClosed = !myOffer || myOffer.status === "withdrawn";
  const pendingOffers = offers.filter((offer) => offer.status === "pending");
  const selectedOffer = offers.find((offer) => offer.status === "accepted");

  const reload = useCallback(async () => {
    if (!isTrustedAuthReady()) { setLoading(false); setActor(null); return; }
    const userKey = await getCurrentCoachUserKey();
    setActor(userKey);
    if (!userKey) {
      setOffers([]);
      setCoachState("none");
      setCanOffer(false);
      setLoading(false);
      return;
    }
    const [nextOffers, nextState, nextCanOffer] = await Promise.all([
      loadCoachOffers(activity.id),
      getPublicCoachState(activity.id),
      userKey === activity.organizerKey ? Promise.resolve(false) : canOfferAsCoach(activity.id),
    ]);
    setOffers(nextOffers);
    setCoachState(nextState);
    setCanOffer(nextCanOffer);
    setLoading(false);
  }, [activity.id, activity.organizerKey]);

  useEffect(() => {
    let live = true;
    void reload().catch(() => { if (live) { setLoading(false); setMessage("Не удалось загрузить отклики тренеров"); } });
    const onChange = (event: Event) => {
      const id = (event as CustomEvent<{ activityId?: string }>).detail?.activityId;
      if (id && id !== activity.id) return;
      void reload().catch(() => { if (live) setMessage("Не удалось обновить отклики"); });
    };
    window.addEventListener(coachRequestsChangedEvent, onChange);
    window.addEventListener(trustedAuthSessionChangedEvent, onChange);
    return () => {
      live = false;
      window.removeEventListener(coachRequestsChangedEvent, onChange);
      window.removeEventListener(trustedAuthSessionChangedEvent, onChange);
    };
  }, [activity.id, reload]);

  const createInvitation = async () => {
    if (busy || !organizer) return;
    setBusy(true);
    setMessage(null);
    try {
      const token = await createCoachInvitation(activity.id);
      setInvitationUrl(buildCoachInvitationUrl(token, window.location.origin));
      setMessage("Ссылка тренеру создана. Предыдущие неиспользованные ссылки отозваны.");
    } catch {
      setMessage("Не удалось создать приглашение. Сначала откройте поиск тренера.");
    } finally { setBusy(false); }
  };

  const shareInvitation = async () => {
    if (!invitationUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "GO IRL — приглашение тренеру", url: invitationUrl });
      } else {
        await navigator.clipboard.writeText(invitationUrl);
        setMessage("Ссылка скопирована. Отправьте её тренеру в Telegram.");
      }
    } catch {
      setMessage("Не удалось отправить ссылку. Скопируйте её из поля.");
    }
  };

  const revokeInvitation = async () => {
    if (busy || !organizer) return;
    setBusy(true);
    try {
      await revokeCoachInvitation(activity.id);
      setInvitationUrl(null);
      setMessage("Неиспользованные приглашения отозваны.");
    } catch { setMessage("Не удалось отозвать приглашение."); }
    finally { setBusy(false); }
  };

  const perform = async (operation: () => Promise<void>, success: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await operation();
      await reload();
      window.dispatchEvent(new CustomEvent(coachRequestsChangedEvent, { detail: { activityId: activity.id } }));
      setMessage(success);
    } catch {
      setMessage("Не удалось выполнить действие. Проверьте авторизацию и повторите попытку.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="coach-panel-status">Загрузка откликов…</div>;
  if (!actor) return null;

  return (
    <section className="coach-panel" aria-label="Отклики тренеров">
      <div className="coach-panel-header"><div><h3>Тренеры события</h3></div></div>
      {selectedOffer && organizer && <div className="coach-panel-status">Назначен тренер: <strong>{selectedOffer.displayName}</strong></div>}
      {organizer && activity.visibility === "invite" && coachState === "requested" && (
        <div className="coach-panel-fields">
          <strong>Пригласить тренера в закрытое событие</strong>
          <p>Это отдельное приглашение на роль тренера. Вступать в участники не требуется.</p>
          <button type="button" className="coach-panel-button" disabled={busy}
            onClick={() => void createInvitation()}>
            {invitationUrl ? "Создать новую ссылку" : "Пригласить тренера по ссылке"}
          </button>
          {invitationUrl && (
            <>
              <label>Личная ссылка тренеру
                <input value={invitationUrl} readOnly onFocus={(event) => event.target.select()} />
              </label>
              <button type="button" className="coach-panel-button" disabled={busy}
                onClick={() => void shareInvitation()}>Поделиться ссылкой</button>
              <button type="button" className="coach-panel-cancel-button" disabled={busy}
                onClick={() => void revokeInvitation()}>Отозвать неиспользованную ссылку</button>
            </>
          )}
          <p>Получатель видит краткое предложение и сможет откликнуться, если у него сохранена роль «Тренер». Новый код делает прежние неиспользованные ссылки недействительными.</p>
        </div>
      )}
      {!organizer && myOffer?.status === "accepted" && <div className="coach-panel-status">Вы назначены тренером этого события</div>}
      {coachState === "confirmed" && !selectedOffer && <div className="coach-panel-status">Тренер уже назначен</div>}

      {organizer && coachState === "requested" && (
        <div className="coach-panel-fields">
          {pendingOffers.length === 0 && <p>Пока нет откликов от тренеров.</p>}
          {pendingOffers.map((offer) => (
            <div className="coach-panel-status" key={offer.id}>
              <strong>{offer.displayName}</strong>
              <div className="coach-panel-actions">
                <button type="button" className="coach-panel-button" disabled={busy}
                  onClick={() => void perform(() => acceptCoachOffer(offer.id), "Тренер назначен")}>
                  Подтвердить тренера
                </button>
                <button type="button" className="coach-panel-cancel-button" disabled={busy}
                  onClick={() => void perform(() => closeCoachOffer(offer.id, "declined"), "Отклик отклонён")}>
                  Отклонить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!organizer && offerIsClosed && canOffer && coachState === "requested" && (
        <div className="coach-panel-fields">
          <label>
            <span>Ваше имя для организатора</span>
            <input value={displayName} onChange={(event: { target: { value: string } }) => setDisplayName(event.target.value)}
              maxLength={80} placeholder="Имя тренера" />
          </label>
          <button type="button" className="coach-panel-button" disabled={busy || displayName.trim().length < 2}
            onClick={() => void perform(() => offerAsCoach(activity.id, displayName), "Отклик отправлен организатору")}>
            Стать тренером события
          </button>
        </div>
      )}
      {!organizer && myOffer?.status === "pending" && (
        <div className="coach-panel-actions">
          <span>Вы откликнулись как тренер. Ожидается решение организатора.</span>
          <button type="button" className="coach-panel-cancel-button" disabled={busy}
            onClick={() => void perform(() => closeCoachOffer(myOffer.id, "withdrawn"), "Отклик отозван")}>
            Отозвать отклик
          </button>
        </div>
      )}
      {!organizer && coachState === "requested" && !canOffer && offerIsClosed && (
        <p>Чтобы откликнуться, выберите в профиле «Тренер → Могу помочь» или «Профессионал». Для закрытого события попросите у организатора отдельную ссылку-приглашение тренеру.</p>
      )}
      {!organizer && myOffer?.status === "declined" && <p>Организатор отклонил предыдущий отклик.</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
