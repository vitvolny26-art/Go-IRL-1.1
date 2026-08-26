export type AssistantContextBridgeState = {
  currentRoute: string;
  activeTab: string;
  screen: string;
  entityType: string;
  entityId: string;
  selectedItemId: string;
  userRole: string;
  formMode: string;
  validationErrors: string[];
  platform: "telegram" | "web" | "";
  uiLocale: string;
};

const emptyContext: AssistantContextBridgeState = {
  currentRoute: "",
  activeTab: "",
  screen: "",
  entityType: "",
  entityId: "",
  selectedItemId: "",
  userRole: "",
  formMode: "",
  validationErrors: [],
  platform: "",
  uiLocale: "",
};

let currentContext = emptyContext;
const listeners = new Set<() => void>();

export const publishAssistantContext = (next: AssistantContextBridgeState) => {
  currentContext = { ...next, validationErrors: [...next.validationErrors] };
  listeners.forEach((listener) => listener());
};

export const getAssistantContext = () => currentContext;

export const subscribeAssistantContext = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
