import { useEffect, useState, type FormEvent } from "react";
import { DevPanel } from "../components/DevPanel";
import { AdminIntegrationsPanel, countReadyIntegrations } from "./AdminIntegrationsPanel";
import { AdminUpdatesPanel, getCurrentAdminUpdateSummary } from "./AdminUpdatesPanel";
import { BeautyMasterOnboardingPanel } from "./BeautyMasterOnboardingPanel";
import { adminRedirectForAuthorization, verifyCurrentAdminSession } from "./adminSession";
import {
  buildRoleInvitationUrl,
  getRoleDemotionErrorMessage,
  requestRoleAssignments,
  requestRoleDemotion,
  requestRoleInvitation,
  type CreatedRoleInvitation,
  type RoleAssignment,
  type RoleInvitationTargetRole,
  requestActivityOrganizerReassignment,
  requestCurrentAdminRole,
} from "./roleInvitations";
import "./admin-login.css";

const telegramBotUsername = String(import.meta.env.VITE_GO_IRL_BOT_USERNAME || "GOirl_bot");
const telegramAppName = String(import.meta.env.VITE_GO_IRL_APP_NAME || "");
const roleLabels: Record<string, string> = {
  organizer: "Организатор",
  professional: "Мастер",
  moderator: "Модератор",
  admin: "Администратор",
  superadmin: "Суперадминистратор",
};

type AdminTab = "overview" | "masters" | "roles" | "integrations" | "updates";

const adminTabs: Array<{ id: AdminTab; icon: string; label: string }> = [
  { id: "overview", icon: "⌂", label: "Обзор" },
  { id: "masters", icon: "✦", label: "Мастера" },
  { id: "roles", icon: "♙", label: "Роли" },
  { id: "integrations", icon: "⇄", label: "Интеграции" },
  { id: "updates", icon: "↻", label: "Обновления" },
];

export function AdminLoginPage() {
  useEffect(() => {
    let active = true;
    void (async () => {
      const authorized = await verifyCurrentAdminSession();
      if (active) window.location.replace(adminRedirectForAuthorization(authorized));
    })();
    return () => { active = false; };
  }, []);
  return <main className="admin-login-shell"><section className="admin-login-card"><h1>Admin</h1><p>Проверяем Telegram-сессию…</p></section></main>;
}

function ActivityOrganizerReassignmentPanel() {
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [activityId, setActivityId] = useState("");
  const [targetUserKey, setTargetUserKey] = useState("");
  const [organizers, setOrganizers] = useState<Awaited<ReturnType<typeof requestRoleAssignments>>>([]);
  const [loadingOrganizers, setLoadingOrganizers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  useEffect(() => {
    let active = true;
    setLoadingOrganizers(true);
    (async () => {
      const role = await requestCurrentAdminRole();
      if (!active) return;
      setCurrentRole(role);
      if (role !== "superadmin") return;
      const assignments = await requestRoleAssignments();
      if (!active) return;
      const next = assignments.filter((assignment) => assignment.role === "organizer");
      setOrganizers(next);
      setTargetUserKey((current) => current || next[0]?.userKey || "");
    })()
      .catch(() => {
        if (active) setError("Не удалось подтвердить роль superadmin или загрузить организаторов.");
      })
      .finally(() => {
        if (active) setLoadingOrganizers(false);
      });
    return () => { active = false; };
  }, []);

  if (currentRole !== "superadmin") return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedActivityId = activityId.trim();
    if (!normalizedActivityId || !targetUserKey) return;
    const selected = organizers.find((organizer) => organizer.userKey === targetUserKey);
    const organizerName = selected
      ? [selected.firstName, selected.lastName].filter(Boolean).join(" ") || selected.username || selected.userKey
      : targetUserKey;
    if (!window.confirm(`Передать Activity ${normalizedActivityId} организатору ${organizerName}?`)) return;

    setSubmitting(true);
    setError("");
    setResult("");
    try {
      const reassignment = await requestActivityOrganizerReassignment(normalizedActivityId, targetUserKey);
      setResult(reassignment.status === "unchanged"
        ? "Этот организатор уже назначен на Activity."
        : `Организатор изменён: ${reassignment.currentOrganizer}.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(message === "target_not_organizer"
        ? "Выбранный пользователь больше не является организатором."
        : message === "target_user_inactive"
          ? "Выбранный организатор заблокирован или удалён."
          : message === "activity_not_found"
          ? "Activity не найдена."
          : message === "activity_organizer_conflict"
            ? "Организатор уже изменён другим действием. Обновите данные и повторите."
            : message === "access_denied"
              ? "Текущая сессия больше не имеет прав superadmin."
              : "Не удалось переназначить организатора.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="admin-login-card admin-role-invitations admin-activity-organizer-reassignment">
      <div className="admin-section-heading">
        <div>
          <h2>Переназначить организатора Activity</h2>
          <p>Только superadmin. Участники, чат и сама Activity сохраняются.</p>
        </div>
      </div>
      <form onSubmit={submit}>
        <input
          value={activityId}
          onChange={(event) => setActivityId(event.target.value)}
          placeholder="Activity ID"
          autoComplete="off"
          disabled={submitting}
        />
        <select
          value={targetUserKey}
          onChange={(event) => setTargetUserKey(event.target.value)}
          disabled={submitting || loadingOrganizers || organizers.length === 0}
        >
          {organizers.length === 0 ? <option value="">Нет доступных организаторов</option> : null}
          {organizers.map((organizer) => (
            <option key={organizer.userKey} value={organizer.userKey}>
              {[organizer.firstName, organizer.lastName].filter(Boolean).join(" ") || organizer.username || organizer.userKey}
            </option>
          ))}
        </select>
        <button type="submit" disabled={submitting || !activityId.trim() || !targetUserKey}>
          {submitting ? "Переназначаем…" : "Переназначить"}
        </button>
      </form>
      {result ? <div className="admin-role-invitation-result">{result}</div> : null}
      {error ? <div className="admin-role-invitation-error">{error}</div> : null}
    </section>
  );
}

export function AdminPanelPage() {
  const [authorized, setAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [targetRole, setTargetRole] = useState<RoleInvitationTargetRole>("organizer");
  const [invitation, setInvitation] = useState<(CreatedRoleInvitation & { url: string }) | null>(null);
  const [invitationError, setInvitationError] = useState("");
  const [creatingInvitation, setCreatingInvitation] = useState(false);
  const [copied, setCopied] = useState(false);
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState("");
  const [demotingUserKey, setDemotingUserKey] = useState("");

  const loadAssignments = async () => {
    setRolesLoading(true);
    setRolesError("");
    try { setAssignments(await requestRoleAssignments()); }
    catch { setRolesError("Не удалось загрузить список ролей."); }
    finally { setRolesLoading(false); }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      const allowed = await verifyCurrentAdminSession();
      if (!active) return;
      if (!allowed) { window.location.replace("/admin/access-denied"); return; }
      setAuthorized(true);
      await loadAssignments();
    })();
    return () => { active = false; };
  }, []);

  const createInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingInvitation(true); setInvitation(null); setInvitationError(""); setCopied(false);
    try {
      const created = await requestRoleInvitation(targetRole);
      const url = buildRoleInvitationUrl(created.startParam, telegramBotUsername, telegramAppName);
      if (!url) throw new Error("role_invitation_link_failed");
      setInvitation({ ...created, url });
    } catch { setInvitationError("Не удалось создать приглашение."); }
    finally { setCreatingInvitation(false); }
  };

  const demote = async (assignment: RoleAssignment) => {
    if (assignment.role === "superadmin") return;
    const name = [assignment.firstName, assignment.lastName].filter(Boolean).join(" ") || assignment.username || assignment.userKey;
    if (!window.confirm(`Разжаловать ${name} из роли «${roleLabels[assignment.role]}» в обычного пользователя?`)) return;
    setDemotingUserKey(assignment.userKey); setRolesError("");
    try {
      await requestRoleDemotion(assignment.userKey);
      await loadAssignments();
    } catch (error) {
      setRolesError(getRoleDemotionErrorMessage(error));
    } finally { setDemotingUserKey(""); }
  };

  const copyInvitation = async () => {
    if (!invitation) return;
    try { await navigator.clipboard.writeText(invitation.url); setCopied(true); }
    catch { setInvitationError("Не удалось скопировать ссылку."); }
  };

  const roleCount = assignments.filter((item) => item.role !== "superadmin").length;
  const connectedIntegrationCount = countReadyIntegrations(authorized, rolesLoading, rolesError);
  const updateSummary = getCurrentAdminUpdateSummary();

  return <main className="admin-login-shell admin-panel-shell">
    {authorized ? <DevPanel /> : null}
    <div className="admin-panel-content">
      <section className="admin-login-card admin-panel-header">
        <div><span className="admin-eyebrow">GO IRL</span><h1>Admin panel</h1></div>
        <div className="admin-panel-header-actions">
          <span className={authorized ? "admin-status is-ready" : "admin-status"}>{authorized ? "Доступ подтверждён" : "Проверяем доступ…"}</span>
          {authorized ? <button className="admin-exit-button" type="button" onClick={() => window.location.assign("/")}>Выйти из админки</button> : null}
        </div>
      </section>

      {authorized && activeTab === "overview" ? <section className="admin-tab-panel">
        <div className="admin-overview-grid">
          <article className="admin-login-card admin-metric-card"><span>Повышенные роли</span><strong>{rolesLoading ? "…" : roleCount}</strong><button type="button" onClick={() => setActiveTab("roles")}>Управлять</button></article>
          <article className="admin-login-card admin-metric-card"><span>Интеграции</span><strong>{connectedIntegrationCount}/4</strong><button type="button" onClick={() => setActiveTab("integrations")}>Открыть</button></article>
          <article className="admin-login-card admin-metric-card"><span>Обновления</span><strong>{updateSummary.ready}/{updateSummary.total}</strong><button type="button" onClick={() => setActiveTab("updates")}>Проверить</button></article>
        </div>
      </section> : null}

      {authorized && activeTab === "masters" ? <BeautyMasterOnboardingPanel /> : null}

      {authorized && activeTab === "roles" ? <section className="admin-tab-panel admin-tab-stack">
        <section className="admin-login-card admin-role-invitations">
          <h2>Приглашение роли</h2>
          <form onSubmit={createInvitation}>
            <select value={targetRole} onChange={(event) => setTargetRole(event.target.value as RoleInvitationTargetRole)} disabled={creatingInvitation}>
              <option value="organizer">Организатор</option><option value="professional">Мастер</option><option value="admin">Администратор (только superadmin)</option>
            </select>
            <button type="submit" disabled={creatingInvitation}>{creatingInvitation ? "Создаём…" : "Сформировать приглашение"}</button>
          </form>
          {invitation ? <div className="admin-role-invitation-result"><input readOnly value={invitation.url} /><button type="button" onClick={() => void copyInvitation()}>{copied ? "Скопировано" : "Скопировать"}</button></div> : null}
          {invitationError ? <div className="admin-role-invitation-error">{invitationError}</div> : null}
        </section>
        <ActivityOrganizerReassignmentPanel />
          <section className="admin-login-card admin-role-invitations admin-role-removal">
          <div className="admin-section-heading"><div><h2>Назначенные роли</h2><p>Организаторы, мастера, модераторы, администраторы и суперадминистраторы.</p></div><button type="button" onClick={() => void loadAssignments()} disabled={rolesLoading}>{rolesLoading ? "Обновляем…" : "Обновить"}</button></div>
          {assignments.length ? <div className="admin-role-list">{assignments.map((item) => {
            const displayName = [item.firstName, item.lastName].filter(Boolean).join(" ") || item.username || item.userKey;
            return <article className="admin-role-row" key={item.userKey}>
              <div><strong>{displayName}</strong><span>{item.username ? `@${item.username} · ` : ""}{item.telegramId || item.userKey}</span><span>{roleLabels[item.role]}</span></div>
              {item.role === "superadmin" ? <span className="admin-role-protected">Защищено</span> : <button className="admin-danger-button" type="button" onClick={() => void demote(item)} disabled={demotingUserKey === item.userKey}>{demotingUserKey === item.userKey ? "Разжалование…" : "Разжаловать"}</button>}
            </article>;
          })}</div> : !rolesLoading ? <p>Повышенных ролей нет.</p> : null}
          {rolesError ? <div className="admin-role-invitation-error">{rolesError}</div> : null}
        </section>
      </section> : null}

      {authorized && activeTab === "integrations" ? <AdminIntegrationsPanel authorized={authorized} rolesLoading={rolesLoading} rolesError={rolesError} /> : null}

      {authorized && activeTab === "updates" ? <AdminUpdatesPanel /> : null}
    </div>

    {authorized ? <nav className="admin-bottom-tabs" aria-label="Разделы админ-панели">{adminTabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? "page" : undefined}><span>{tab.icon}</span><small>{tab.label}</small></button>)}</nav> : null}
  </main>;
}

export function AdminAccessDeniedPage() {
  return <main className="admin-login-shell"><section className="admin-login-card"><h1>Admin</h1><p>Access denied.</p><a href="/">Вернуться в приложение</a></section></main>;
}
