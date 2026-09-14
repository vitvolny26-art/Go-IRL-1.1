import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Link2, Save } from "lucide-react";
import {
  beautySlugFromPublicLink,
  buildTelegramBeautyInviteUrl,
  isValidBeautyPublicSlug,
  normalizeBeautyPublicSlug,
} from "./beautyPublicSlug";
import { readBeautyLanguage } from "./beautyI18n";
import { loadBeautyWorkspace, updateBeautyPublicSlug } from "./beautyWorkspaceStorage";
import type { BeautyWorkspace } from "./beautySetupModel";
import "./beauty-public-slug.css";

const copy = {
  ru: { title: "Ссылка мастера", hint: "Только английские буквы, цифры и дефис. Название должно быть свободно.", save: "Сохранить", saved: "Ссылка сохранена", taken: "Это название уже занято", invalid: "Введите от 3 до 48 символов латиницей", error: "Не удалось сохранить ссылку", miniApp: "Ссылка Telegram Mini App" },
  uk: { title: "Посилання майстра", hint: "Лише англійські літери, цифри та дефіс. Назва має бути вільною.", save: "Зберегти", saved: "Посилання збережено", taken: "Ця назва вже зайнята", invalid: "Введіть від 3 до 48 символів латиницею", error: "Не вдалося зберегти посилання", miniApp: "Посилання Telegram Mini App" },
  cs: { title: "Odkaz profesionála", hint: "Pouze anglická písmena, číslice a pomlčka. Název musí být volný.", save: "Uložit", saved: "Odkaz byl uložen", taken: "Tento název je již obsazený", invalid: "Zadejte 3 až 48 znaků latinkou", error: "Odkaz se nepodařilo uložit", miniApp: "Odkaz Telegram Mini App" },
  en: { title: "Professional link", hint: "Use English letters, numbers, and hyphens only. The name must be available.", save: "Save", saved: "Link saved", taken: "This name is already taken", invalid: "Enter 3 to 48 Latin characters", error: "The link could not be saved", miniApp: "Telegram Mini App link" },
  pl: { title: "Professional link", hint: "Use English letters, numbers, and hyphens only. The name must be available.", save: "Save", saved: "Link saved", taken: "This name is already taken", invalid: "Enter 3 to 48 Latin characters", error: "The link could not be saved", miniApp: "Telegram Mini App link" },
  sk: { title: "Odkaz profesionála", hint: "Pouze anglická písmena, číslice a pomlčka. Název musí být volný.", save: "Uložit", saved: "Odkaz byl uložen", taken: "Tento název je již obsazený", invalid: "Zadejte 3 až 48 znaků latinkou", error: "Odkaz se nepodařilo uložit", miniApp: "Odkaz Telegram Mini App" },
} as const;

type SaveState = "idle" | "saving" | "saved" | "taken" | "invalid" | "error";

const isMasterWorkspacePath = () => {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path === "/beauty/workspace" || path === "/services/beauty/master";
};

export function BeautyPublicSlugEditor() {
  const language = readBeautyLanguage();
  const text = copy[language];
  const [target, setTarget] = useState<Element | null>(null);
  const [workspace, setWorkspace] = useState<BeautyWorkspace | null>(null);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<SaveState>("idle");

  useEffect(() => {
    if (!isMasterWorkspacePath()) return;
    let active = true;
    void loadBeautyWorkspace(language).then((loaded) => {
      if (!active) return;
      setWorkspace(loaded);
      setDraft(beautySlugFromPublicLink(loaded.publicLink));
    }).catch(() => setState("error"));
    return () => { active = false; };
  }, [language]);

  useEffect(() => {
    const resolve = () => setTarget(document.querySelector(".beauty-workspace-page-view"));
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const normalized = normalizeBeautyPublicSlug(draft);
  const telegramUrl = useMemo(() => buildTelegramBeautyInviteUrl(
    beautySlugFromPublicLink(workspace?.publicLink || ""),
    String(import.meta.env.VITE_GO_IRL_BOT_USERNAME || "GOirl_bot"),
    String(import.meta.env.VITE_GO_IRL_APP_NAME || ""),
  ), [workspace?.publicLink]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace || !isValidBeautyPublicSlug(normalized)) {
      setState("invalid");
      return;
    }
    setState("saving");
    try {
      const updated = await updateBeautyPublicSlug(workspace, normalized);
      setWorkspace(updated);
      setDraft(beautySlugFromPublicLink(updated.publicLink));
      setState("saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setState(message === "beauty_slug_taken" ? "taken" : message === "beauty_slug_invalid" ? "invalid" : "error");
    }
  };

  if (!target || !workspace) return null;
  const message = state === "saved" ? text.saved : state === "taken" ? text.taken : state === "invalid" ? text.invalid : state === "error" ? text.error : "";

  return createPortal(<section className="beauty-public-slug-editor">
    <div className="beauty-public-slug-heading"><Link2 /><div><h2>{text.title}</h2><p>{text.hint}</p></div></div>
    <form onSubmit={submit}>
      <span>t.me/GOirl_bot?startapp=</span>
      <input
        aria-label={text.title}
        value={draft}
        maxLength={48}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => { setDraft(normalizeBeautyPublicSlug(event.target.value)); setState("idle"); }}
      />
      <button type="submit" disabled={state === "saving"}><Save size={17} />{text.save}</button>
    </form>
    {telegramUrl && <a href={telegramUrl} target="_blank" rel="noreferrer">{text.miniApp}: {telegramUrl}</a>}
    {message && <div className={`beauty-public-slug-status is-${state}`} role="status">{state === "saved" && <Check size={16} />}{message}</div>}
  </section>, target);
}
