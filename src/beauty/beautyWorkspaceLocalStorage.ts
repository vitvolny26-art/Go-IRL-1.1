import type { Language } from "../types";
import {
  BEAUTY_SCHEMA_VERSION,
  createDefaultBeautyWorkspace,
  upgradeBeautyWorkspace,
  type BeautyWorkspace,
} from "./beautySetupModel";

const databaseName = "go-irl-beauty";
const storeName = "workspace";
const workspaceKey = "primary";
const recoveryStorageKey = "go-irl-beauty-workspace-v2";
const draftStateKey = "draft-state";
const draftStateRecoveryStorageKey = "go-irl-beauty-workspace-draft-v1";
let saveQueue: Promise<unknown> = Promise.resolve();
let draftStateQueue: Promise<unknown> = Promise.resolve();

export type BeautyWorkspaceDraftState = {
  dirty: boolean;
  baseUpdatedAt: string | null;
  updatedAt: string;
};

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(databaseName, BEAUTY_SCHEMA_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("Beauty IndexedDB is unavailable."));
});

const runTransaction = async <T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) => {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Beauty workspace operation failed."));
      transaction.onabort = () => reject(transaction.error || new Error("Beauty workspace transaction was aborted."));
    });
  } finally {
    database.close();
  }
};

const readRecoverySnapshot = (language: Language): BeautyWorkspace | undefined => {
  try {
    const parsed = JSON.parse(localStorage.getItem(recoveryStorageKey) || "null") as unknown;
    return upgradeBeautyWorkspace(parsed, language);
  } catch {
    return undefined;
  }
};

const newestWorkspace = (first?: BeautyWorkspace, second?: BeautyWorkspace) => {
  if (!first) return second;
  if (!second) return first;
  return first.updatedAt >= second.updatedAt ? first : second;
};

export const loadLocalBeautyWorkspace = async (language: Language = "en"): Promise<BeautyWorkspace> => {
  const recovery = readRecoverySnapshot(language);
  if (typeof indexedDB === "undefined") return recovery || createDefaultBeautyWorkspace(language);
  const stored = await runTransaction<unknown>("readonly", (store) => store.get(workspaceKey));
  const upgradedStored = upgradeBeautyWorkspace(stored, language);
  const workspace = newestWorkspace(upgradedStored, recovery) || createDefaultBeautyWorkspace(language);
  if (upgradedStored && (stored as { schemaVersion?: number } | undefined)?.schemaVersion !== BEAUTY_SCHEMA_VERSION) {
    await saveLocalBeautyWorkspace(workspace);
  }
  return workspace;
};

export const saveLocalBeautyWorkspace = async (workspace: BeautyWorkspace) => {
  const snapshot = { ...workspace, schemaVersion: BEAUTY_SCHEMA_VERSION, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(recoveryStorageKey, JSON.stringify(snapshot));
  } catch {
    // IndexedDB remains the primary store when synchronous recovery is unavailable.
  }
  if (typeof indexedDB === "undefined") return;
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(() => runTransaction<IDBValidKey>("readwrite", (store) => store.put(snapshot, workspaceKey)));
  await saveQueue;
};

const normalizeDraftState = (value: unknown): BeautyWorkspaceDraftState | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<BeautyWorkspaceDraftState>;
  if (typeof candidate.dirty !== "boolean" || typeof candidate.updatedAt !== "string") return undefined;
  return {
    dirty: candidate.dirty,
    baseUpdatedAt: typeof candidate.baseUpdatedAt === "string" ? candidate.baseUpdatedAt : null,
    updatedAt: candidate.updatedAt,
  };
};

const readRecoveryDraftState = () => {
  try {
    return normalizeDraftState(JSON.parse(localStorage.getItem(draftStateRecoveryStorageKey) || "null"));
  } catch {
    return undefined;
  }
};

const newestDraftState = (first?: BeautyWorkspaceDraftState, second?: BeautyWorkspaceDraftState) => {
  if (!first) return second;
  if (!second) return first;
  return first.updatedAt >= second.updatedAt ? first : second;
};

export const loadLocalBeautyWorkspaceDraftState = async (): Promise<BeautyWorkspaceDraftState | undefined> => {
  const recovery = readRecoveryDraftState();
  if (typeof indexedDB === "undefined") return recovery;
  const stored = normalizeDraftState(await runTransaction<unknown>("readonly", (store) => store.get(draftStateKey)));
  return newestDraftState(stored, recovery);
};

const writeLocalBeautyWorkspaceDraftState = async (dirty: boolean, baseUpdatedAt: string | null) => {
  const state: BeautyWorkspaceDraftState = { dirty, baseUpdatedAt, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(draftStateRecoveryStorageKey, JSON.stringify(state));
  } catch {
    // IndexedDB remains the primary store when synchronous recovery is unavailable.
  }
  if (typeof indexedDB !== "undefined") {
    await runTransaction<IDBValidKey>("readwrite", (store) => store.put(state, draftStateKey));
  }
  return state;
};

const enqueueDraftStateMutation = <T>(mutation: () => Promise<T>): Promise<T> => {
  const queued = draftStateQueue.catch(() => undefined).then(mutation);
  draftStateQueue = queued.then(() => undefined, () => undefined);
  return queued;
};

export const markLocalBeautyWorkspaceDraft = (baseUpdatedAt: string | null) =>
  enqueueDraftStateMutation(async () => {
    const current = await loadLocalBeautyWorkspaceDraftState();
    return current?.dirty ? current : writeLocalBeautyWorkspaceDraftState(true, baseUpdatedAt);
  });

export const rebaseLocalBeautyWorkspaceDraft = (baseUpdatedAt: string | null) =>
  enqueueDraftStateMutation(async () => {
    const current = await loadLocalBeautyWorkspaceDraftState();
    return current?.dirty ? writeLocalBeautyWorkspaceDraftState(true, baseUpdatedAt) : current;
  });

export const clearLocalBeautyWorkspaceDraft = () =>
  enqueueDraftStateMutation(() => writeLocalBeautyWorkspaceDraftState(false, null));

export const hasLocalBeautyWorkspaceDraft = async () =>
  Boolean((await loadLocalBeautyWorkspaceDraftState())?.dirty);

export const resetLocalBeautyWorkspace = async () => {
  try {
    localStorage.removeItem(recoveryStorageKey);
    localStorage.removeItem(draftStateRecoveryStorageKey);
  } catch {
    // Continue with IndexedDB reset when localStorage is unavailable.
  }
  if (typeof indexedDB === "undefined") return;
  await saveQueue;
  await draftStateQueue;
  await runTransaction<undefined>("readwrite", (store) => store.delete(workspaceKey));
  await runTransaction<undefined>("readwrite", (store) => store.delete(draftStateKey));
};

export const beautyStorageMetadata = {
  databaseName,
  storeName,
  workspaceKey,
  recoveryStorageKey,
  draftStateKey,
  draftStateRecoveryStorageKey,
  schemaVersion: BEAUTY_SCHEMA_VERSION,
} as const;
