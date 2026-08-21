export const canonicalProfilePath = "/profile";

export type ProfileEntryHistoryMode = "push" | "replace";

type ProfileEntryHistory = Pick<History, "pushState" | "replaceState">;
type ProfileEntryView = "home" | "profile";

type EnterCanonicalProfileOptions = {
  currentView: string;
  setView: (view: ProfileEntryView) => void;
  history: ProfileEntryHistory;
  mode?: ProfileEntryHistoryMode;
  schedule?: (callback: () => void) => void;
};

export const enterCanonicalProfile = ({
  currentView,
  setView,
  history,
  mode = "push",
  schedule = (callback) => callback(),
}: EnterCanonicalProfileOptions): "open" | "reopen" => {
  const navigate = () => {
    if (mode === "replace") history.replaceState({}, "", canonicalProfilePath);
    else history.pushState({}, "", canonicalProfilePath);
    setView("profile");
  };

  if (currentView === "profile") {
    setView("home");
    schedule(navigate);
    return "reopen";
  }

  navigate();
  return "open";
};
