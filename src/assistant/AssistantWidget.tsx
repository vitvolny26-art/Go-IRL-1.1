import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Bot, ChevronDown, Send, X } from "lucide-react";
import { useAppStore } from "../store";
import { getAssistantContext, subscribeAssistantContext } from "./assistantContext";

const endpoint = "https://n8n.realitka.pp.ua/webhook/7b684d61-574e-43df-8287-38fad3ec626c/go-irl-ai-assistant-draft";
const conversationStorageKey = "go-irl-ai-assistant-conversation-id";

type Message = { id: string; role: "user" | "assistant"; text: string };
type AssistantResponse = { conversation_id?: string; answer?: string; status?: string };

const copy = {
  ru: { title: "GO IRL помощник", intro: "Спросите, что делать на этом экране.", placeholder: "Ваш вопрос…", send: "Отправить", close: "Закрыть", collapse: "Свернуть", error: "Помощник сейчас недоступен. Попробуйте позже." },
  uk: { title: "GO IRL помічник", intro: "Запитайте, що робити на цьому екрані.", placeholder: "Ваше запитання…", send: "Надіслати", close: "Закрити", collapse: "Згорнути", error: "Помічник зараз недоступний. Спробуйте пізніше." },
  cs: { title: "GO IRL asistent", intro: "Zeptejte se, co udělat na této obrazovce.", placeholder: "Váš dotaz…", send: "Odeslat", close: "Zavřít", collapse: "Sbalit", error: "Asistent je teď nedostupný. Zkuste to později." },
  en: { title: "GO IRL assistant", intro: "Ask what to do on this screen.", placeholder: "Your question…", send: "Send", close: "Close", collapse: "Collapse", error: "The assistant is unavailable right now. Please try again later." },
} as const;

const newId = (prefix: "conv" | "req") => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getConversationId = () => {
  const stored = localStorage.getItem(conversationStorageKey);
  if (stored?.startsWith("conv-")) return stored;
  const created = newId("conv");
  localStorage.setItem(conversationStorageKey, created);
  return created;
};

function AssistantWidget() {
  const language = useAppStore((state) => state.language);
  const view = useAppStore((state) => state.view);
  const userRole = useAppStore((state) => state.userRole);
  const bridgedContext = useSyncExternalStore(subscribeAssistantContext, getAssistantContext, getAssistantContext);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [route, setRoute] = useState(() => window.location.pathname);
  const conversationId = useRef(getConversationId());
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = copy[language];

  useEffect(() => {
    const syncRoute = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  const context = useMemo(() => ({
    currentRoute: route,
    activeTab: bridgedContext.activeTab || view,
    screen: bridgedContext.screen || view,
    entityType: bridgedContext.entityType,
    entityId: bridgedContext.entityId,
    selectedItemId: bridgedContext.selectedItemId,
    userRole: bridgedContext.userRole || (userRole === "admin" || userRole === "superadmin" ? "admin" : userRole === "organizer" ? "organizer" : "unknown"),
    formMode: bridgedContext.formMode || (view === "create" ? "create" : ""),
    validationErrors: bridgedContext.validationErrors,
    platform: bridgedContext.platform || (window.Telegram?.WebApp ? "telegram" : "web"),
    uiLocale: bridgedContext.uiLocale || language,
    responseLanguage: language,
  }), [bridgedContext, language, route, userRole, view]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;
    const userMessage: Message = { id: newId("req"), role: "user", text: message };
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: userMessage.id,
          conversation_id: conversationId.current,
          message,
          response_language: language,
          context,
        }),
      });
      const payload = await response.json() as AssistantResponse;
      if (payload.conversation_id?.startsWith("conv-")) {
        conversationId.current = payload.conversation_id;
        localStorage.setItem(conversationStorageKey, payload.conversation_id);
      }
      if (!response.ok || !payload.answer) throw new Error(payload.status || "assistant_unavailable");
      setMessages((current) => [...current, { id: `${userMessage.id}-answer`, role: "assistant", text: payload.answer! }]);
    } catch {
      setMessages((current) => [...current, { id: `${userMessage.id}-error`, role: "assistant", text: t.error }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className={`assistant-widget${open ? " is-open" : ""}`} aria-label={t.title}>
      {open ? (
        <section className="assistant-panel" role="dialog" aria-label={t.title}>
          <header className="assistant-header">
            <span className="assistant-brand"><Bot aria-hidden="true" /><strong>{t.title}</strong></span>
            <button type="button" onClick={() => setOpen(false)} aria-label={t.collapse}><ChevronDown /></button>
          </header>
          <div className="assistant-messages" ref={scrollRef} aria-live="polite">
            {!messages.length && <p className="assistant-intro">{t.intro}</p>}
            {messages.map((message) => <p className={`assistant-message ${message.role}`} key={message.id}>{message.text}</p>)}
            {busy && <p className="assistant-message assistant">…</p>}
          </div>
          <form className="assistant-compose" onSubmit={submit}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t.placeholder} maxLength={2000} aria-label={t.placeholder} />
            <button type="submit" disabled={busy || !draft.trim()} aria-label={t.send}><Send /></button>
          </form>
        </section>
      ) : (
        <button className="assistant-launcher" type="button" onClick={() => setOpen(true)} aria-label={t.title}>
          <Bot aria-hidden="true" /><span>AI</span>
        </button>
      )}
      {open && <button className="assistant-sr-close" type="button" onClick={() => setOpen(false)} aria-label={t.close}><X /></button>}
    </aside>
  );
}

const mount = document.getElementById("go-irl-assistant-root");
if (mount) createRoot(mount).render(<AssistantWidget />);
