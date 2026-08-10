import {
  browserMockDisplayName,
  browserMockUserKey,
  getCurrentAuthSession,
  initializeTrustedAuth,
  isBrowserMockMode,
  isTrustedAuthReady,
  readAuthDisplayName,
  readAuthUserKey,
} from "./authSession";
import { supabase } from "./supabase";
import { ensureFirstOnboardingComplete } from "./onboarding/firstOnboarding";
import type { ActivityChat, ActivityChatMessage } from "./types";

const demoChatStorageKey = "go-irl-demo-activity-chat-v1";

type DemoChatState = {
  chats: ActivityChat[];
  messages: ActivityChatMessage[];
};

const isActivityChatDemoMode = () =>
  typeof window !== "undefined" &&
  (isBrowserMockMode() || (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && !isTrustedAuthReady()));

const readDemoChatState = (): DemoChatState => {
  try {
    return JSON.parse(localStorage.getItem(demoChatStorageKey) || "{\"chats\":[],\"messages\":[]}") as DemoChatState;
  } catch {
    return { chats: [], messages: [] };
  }
};

const writeDemoChatState = (state: DemoChatState) => {
  localStorage.setItem(demoChatStorageKey, JSON.stringify(state));
};

const demoChatExpiry = () => new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

export async function getCurrentChatIdentity() {
  if (isActivityChatDemoMode()) {
    return { userKey: browserMockUserKey, displayName: browserMockDisplayName };
  }

  const existing = getCurrentAuthSession();
  const existingUserKey = readAuthUserKey(existing);

  if (existingUserKey) {
    return {
      userKey: existingUserKey,
      displayName: readAuthDisplayName(existing),
    };
  }

  const identity = await initializeTrustedAuth();

  return {
    userKey: readAuthUserKey(identity),
    displayName: readAuthDisplayName(identity),
  };
}

export async function ensureActivityChat(activityId: string) {
  if (isActivityChatDemoMode()) {
    const state = readDemoChatState();
    const existing = state.chats.find((chat) => chat.activityId === activityId);
    if (existing) return existing.id;

    const now = new Date().toISOString();
    const chat: ActivityChat = {
      id: `demo-chat-${activityId}`,
      activityId,
      createdByUserKey: browserMockUserKey,
      status: "active",
      expiresAt: demoChatExpiry(),
      createdAt: now,
      updatedAt: now,
    };

    state.chats.push(chat);
    writeDemoChatState(state);
    return chat.id;
  }

  await ensureFirstOnboardingComplete();

  const { data, error } = await supabase.rpc("go_irl_ensure_activity_chat", {
    p_activity_id: activityId,
  });

  if (error) throw error;

  return data as string;
}

export async function loadActivityChat(activityId: string) {
  if (isActivityChatDemoMode()) {
    const state = readDemoChatState();
    return state.chats.find((chat) => chat.activityId === activityId) || null;
  }

  const { data, error } = await supabase
    .from("activity_chats")
    .select("*")
    .eq("activity_id", activityId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    activityId: data.activity_id,
    createdByUserKey: data.created_by_user_key,
    status: data.status,
    expiresAt: data.expires_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  } as ActivityChat;
}

export async function loadActivityChatMessages(activityId: string) {
  if (isActivityChatDemoMode()) {
    const state = readDemoChatState();
    return state.messages
      .filter((message) => message.activityId === activityId && message.status === "visible")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  const { data, error } = await supabase
    .from("activity_chat_messages")
    .select("*")
    .eq("activity_id", activityId)
    .eq("status", "visible")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    chatId: row.chat_id,
    activityId: row.activity_id,
    senderUserKey: row.sender_user_key,
    senderDisplayName: row.sender_display_name,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
  })) as ActivityChatMessage[];
}

export async function sendActivityChatMessage(activityId: string, body: string) {
  const trimmed = body.trim();

  if (!trimmed) {
    throw new Error("empty_message");
  }

  if (trimmed.length > 1000) {
    throw new Error("message_too_long");
  }

  const identity = await getCurrentChatIdentity();

  if (!identity.userKey) {
    throw new Error("auth_required");
  }

  const chatId = await ensureActivityChat(activityId);

  if (isActivityChatDemoMode()) {
    const state = readDemoChatState();
    const now = new Date().toISOString();
    state.messages.push({
      id: `demo-message-${Date.now()}`,
      chatId,
      activityId,
      senderUserKey: identity.userKey,
      senderDisplayName: identity.displayName,
      body: trimmed,
      status: "visible",
      createdAt: now,
      editedAt: null,
      deletedAt: null,
    });
    writeDemoChatState(state);
    return;
  }

  const { error } = await supabase
    .from("activity_chat_messages")
    .insert({
      chat_id: chatId,
      activity_id: activityId,
      sender_user_key: identity.userKey,
      sender_display_name: identity.displayName,
      body: trimmed,
      status: "visible",
    });

  if (error) throw error;
}

export async function hideOwnActivityChatMessage(messageId: string) {
  if (isActivityChatDemoMode()) {
    const state = readDemoChatState();
    writeDemoChatState({
      ...state,
      messages: state.messages.map((message) =>
        message.id === messageId ? { ...message, status: "deleted", deletedAt: new Date().toISOString() } : message,
      ),
    });
    return;
  }

  const identity = await getCurrentChatIdentity();
  if (!identity.userKey) throw new Error("auth_required");
  await ensureFirstOnboardingComplete();

  const { error } = await supabase
    .from("activity_chat_messages")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("sender_user_key", identity.userKey);

  if (error) throw error;
}
