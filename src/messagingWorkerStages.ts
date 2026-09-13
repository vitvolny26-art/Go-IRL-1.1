export type WorkerStageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

export type MessagingWorkerStagesResult<TReminders, TNotifications> = {
  reminders: WorkerStageResult<TReminders>;
  notifications: WorkerStageResult<TNotifications>;
};

const normalizeStageError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error ?? "unknown"));

const runStage = async <T>(run: () => Promise<T>): Promise<WorkerStageResult<T>> => {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error: normalizeStageError(error) };
  }
};

export async function runMessagingWorkerStages<TReminders, TNotifications>(
  runReminders: () => Promise<TReminders>,
  runNotifications: () => Promise<TNotifications>,
): Promise<MessagingWorkerStagesResult<TReminders, TNotifications>> {
  const reminders = await runStage(runReminders);
  const notifications = await runStage(runNotifications);
  return { reminders, notifications };
}

export function messagingWorkerStageFailureCode<TReminders, TNotifications>(
  result: MessagingWorkerStagesResult<TReminders, TNotifications>,
) {
  const failures: string[] = [];
  if (!result.reminders.ok) failures.push(`reminders=${result.reminders.error.message}`);
  if (!result.notifications.ok) failures.push(`notifications=${result.notifications.error.message}`);
  return failures.length ? `messaging_worker_stage_failed:${failures.join("|")}` : null;
}
