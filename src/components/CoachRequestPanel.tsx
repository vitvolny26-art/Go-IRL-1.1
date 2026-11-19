import { useEffect, useMemo, useState } from "react";
import { Dumbbell, MapPin, Star, UserCheck, XCircle } from "lucide-react";
import {
  cancelCoachRequest,
  getCurrentCoachUserKey,
  getDemoCoachProfile,
  loadCoachRequestsForActivity,
  requestCoachForActivity,
} from "../coachFeature";
import { isActiveCoachRequest, resolveCoachRequestType } from "../coachRequestState";
import { CoachOfferPanel } from "./CoachOfferPanel";
import type { Activity, CoachRequest, SportLevel, UserRole } from "../types";

type CoachRequestsChangedDetail = { activityId: string };

type CoachRequestPanelProps = {
  activity: Activity;
  userRole: UserRole;
};

const coachRequestsChangedEvent = "go-irl-coach-requests-changed";
const levelOptions: Array<{ value: SportLevel; label: string }> = [
  { value: "beginner", label: "Новички" },
  { value: "intermediate", label: "Средний уровень" },
  { value: "advanced", label: "Продвинутые" },
];

const copy = {
  ariaLabel: "Тренер",
  title: "Тренер",
  description: "Тренер поможет провести игру, разминку и объяснить правила новичкам.",
  requested: "Тренер запрошен",
  participantWanted: "Вы хотите тренера",
  participantCount: "участников хотят тренера",
  organizerButton: "Пригласить тренера",
  participantButton: "Хочу тренера",
  disabledButton: "Запрос отправлен",
  organizerCancelButton: "Больше не нужен",
  participantCancelButton: "Отменить запрос",
  loadError: "Не удалось загрузить тренера",
  submitSuccess: "Тренер запрошен",
  participantSuccess: "Вы хотите тренера",
  submitError: "Не удалось отправить запрос",
  cancelSuccess: "Запрос тренера отменён",
  participantCancelSuccess: "Запрос отменён",
  cancelError: "Не удалось отменить запрос",
};

const notifyCoachRequestsChanged = (activityId: string) => {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent<CoachRequestsChangedDetail>(coachRequestsChangedEvent, {
    detail: { activityId },
  }));
};

const coachStatusLabel = (status: CoachRequest["status"]) => {
  switch (status) {
    case "pending": return "ожидает подтверждения";
    case "matched": return "тренер найден";
    case "confirmed": return "тренер подтверждён";
    case "completed": return "завершено";
    case "rejected": return "отклонено";
    case "cancelled": return "отменено";
    default: return "в обработке";
  }
};

export function CoachRequestPanel({ activity, userRole }: CoachRequestPanelProps) {
  const [requests, setRequests] = useState<CoachRequest[]>([]);
  const [currentUserKey, setCurrentUserKey] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState<SportLevel | "">(activity.metadata?.sport?.level || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requestType = resolveCoachRequestType(activity, currentUserKey, userRole);
  const canManage = requestType === "organizer_request";

  const organizerRequest = useMemo(
    () => requests.find((request) => request.requestType === "organizer_request" && isActiveCoachRequest(request)),
    [requests],
  );

  const demoCoach = organizerRequest?.status === "confirmed"
    ? getDemoCoachProfile(organizerRequest.coachProfileId)
    : null;

  const participantInterest = useMemo(
    () => requests.find((request) => request.requestType === "participant_interest" && request.requesterUserKey === currentUserKey && isActiveCoachRequest(request)),
    [requests, currentUserKey],
  );

  const interestCount = useMemo(
    () => requests.filter((request) => request.requestType === "participant_interest" && request.status === "pending").length,
    [requests],
  );

  const activeRequest = canManage ? organizerRequest : participantInterest;
  const canCancel = isActiveCoachRequest(activeRequest);

  const reload = async () => {
    const [userKey, coachRequests] = await Promise.all([
      getCurrentCoachUserKey(),
      loadCoachRequestsForActivity(activity.id),
    ]);

    setCurrentUserKey(userKey);
    setRequests(coachRequests);
  };

  useEffect(() => {
    void reload().catch(() => {
      setMessage(copy.loadError);
    });
  }, [activity.id]);

  const handleRequest = async () => {
    if (!requestType) return;

    setLoading(true);
    setMessage(null);

    try {
      await requestCoachForActivity(
        activity,
        requestType,
        canManage ? { goal, level: level || undefined } : undefined,
      );
      await reload();
      notifyCoachRequestsChanged(activity.id);
      setMessage(canManage ? copy.submitSuccess : copy.participantSuccess);
    } catch {
      setMessage(copy.submitError);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!activeRequest) return;

    setLoading(true);
    setMessage(null);

    try {
      await cancelCoachRequest(activeRequest.id);
      await reload();
      notifyCoachRequestsChanged(activeRequest.activityId);
      setMessage(canManage ? copy.cancelSuccess : copy.participantCancelSuccess);
    } catch {
      setMessage(copy.cancelError);
    } finally {
      setLoading(false);
    }
  };

  const buttonLabel = canManage ? copy.organizerButton : copy.participantButton;
  const cancelLabel = canManage ? copy.organizerCancelButton : copy.participantCancelButton;
  const disabled = loading || !requestType || Boolean(activeRequest);

  return (
    <>
    <section className="coach-panel" aria-label={copy.ariaLabel}>
      <div className="coach-panel-header">
        <div className="coach-panel-icon">
          <Dumbbell size={18} aria-hidden="true" />
        </div>
        <div>
          <h3>{copy.title}</h3>
          <p>{copy.description}</p>
        </div>
      </div>

      {organizerRequest ? (
        <div className="coach-panel-status">
          <UserCheck size={18} aria-hidden="true" />
          <span>{copy.requested} · {coachStatusLabel(organizerRequest.status)}</span>
        </div>
      ) : null}

      {demoCoach ? (
        <div className="coach-profile-card">
          <div className="coach-profile-avatar">AL</div>
          <div>
            <strong>{demoCoach.displayName}</strong>
            <span>Sport Coach</span>
            <small><MapPin size={13} aria-hidden="true" />{demoCoach.city}</small>
          </div>
        </div>
      ) : null}

      {interestCount > 0 && canManage ? (
        <div className="coach-panel-status">
          <Star size={18} aria-hidden="true" />
          <span>{interestCount} {copy.participantCount}</span>
        </div>
      ) : null}

      {requestType === "participant_interest" && participantInterest ? (
        <div className="coach-panel-status">
          <Star size={18} aria-hidden="true" />
          <span>{copy.participantWanted}</span>
        </div>
      ) : null}

      {canManage && !organizerRequest ? (
        <div className="coach-panel-fields">
          <label>
            <span>Уровень участников</span>
            <select value={level} onChange={(event) => setLevel(event.target.value as SportLevel | "")}>
              <option value="">Не указан</option>
              {levelOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Что должен сделать тренер</span>
            <textarea
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              maxLength={240}
              rows={3}
              placeholder="Например: провести разминку и помочь новичкам с правилами"
            />
          </label>
        </div>
      ) : null}

      <div className="coach-panel-actions">
        <button
          type="button"
          className="coach-panel-button"
          onClick={handleRequest}
          disabled={disabled}
        >
          {!requestType ? "Недоступно" : disabled ? copy.disabledButton : buttonLabel}
        </button>

        {canCancel ? (
          <button
            type="button"
            className="coach-panel-cancel-button"
            onClick={handleCancel}
            disabled={loading}
          >
            <XCircle size={16} aria-hidden="true" />
            <span>{cancelLabel}</span>
          </button>
        ) : null}
      </div>

      {message ? <div className="coach-panel-message">{message}</div> : null}
    </section>
    <CoachOfferPanel activity={activity} />
    </>
  );
}
