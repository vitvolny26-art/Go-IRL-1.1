import { useEffect, useState } from "react";
import { beginGoogleWebAuth } from "../auth/googleWebAuth";
import { getCurrentAuthSession, initializeTrustedAuth } from "../authSession";
import { resolveCurrentUserRole, useAppStore } from "../store";
import type { Language } from "../types";
import {
  checkBeautyWorkspaceOwnerTransfer,
  claimBeautyWorkspaceOwnerTransfer,
  isBeautyWorkspaceOwnerTransferToken,
} from "./beautyWorkspaceOwnerTransfer";
import "./beauty-setup.css";

type ViewState = "checking" | "google_required" | "claiming" | "pending" | "approved" | "rejected" | "expired" | "conflict" | "unavailable";

const copy: Record<Language, Record<ViewState | "title" | "googleAction" | "back", string>> = {
  ru: { title: "Смена владельца кабинета", checking: "Проверяем ссылку…", google_required: "Войдите через Google. После идентификации суперадминистратор получит запрос на подтверждение передачи кабинета.", googleAction: "Войти через Google", claiming: "Подтверждаем вашу учётную запись…", pending: "Учётная запись подтверждена. Ожидаем решения суперадминистратора. Эта страница обновится автоматически.", approved: "Передача подтверждена. Открываем кабинет…", rejected: "Суперадминистратор отклонил передачу кабинета.", expired: "Ссылка истекла или была отозвана.", conflict: "Эта учётная запись не может стать владельцем кабинета.", unavailable: "Не удалось проверить запрос. Повторите позже.", back: "Вернуться в сервисы" },
  uk: { title: "Зміна власника кабінету", checking: "Перевіряємо посилання…", google_required: "Увійдіть через Google. Після ідентифікації суперадміністратор отримає запит на підтвердження передачі кабінету.", googleAction: "Увійти через Google", claiming: "Підтверджуємо ваш акаунт…", pending: "Акаунт підтверджено. Очікуємо рішення суперадміністратора. Сторінка оновиться автоматично.", approved: "Передачу підтверджено. Відкриваємо кабінет…", rejected: "Суперадміністратор відхилив передачу кабінету.", expired: "Посилання прострочено або відкликано.", conflict: "Цей акаунт не може стати власником кабінету.", unavailable: "Не вдалося перевірити запит. Спробуйте пізніше.", back: "Повернутися до сервісів" },
  cs: { title: "Změna vlastníka kabinetu", checking: "Kontrolujeme odkaz…", google_required: "Přihlaste se přes Google. Po ověření dostane superadmin žádost o schválení převodu kabinetu.", googleAction: "Přihlásit přes Google", claiming: "Ověřujeme váš účet…", pending: "Účet je ověřen. Čekáme na rozhodnutí superadmina. Stránka se aktualizuje automaticky.", approved: "Převod byl schválen. Otevíráme kabinet…", rejected: "Superadmin převod kabinetu zamítl.", expired: "Odkaz vypršel nebo byl odvolán.", conflict: "Tento účet se nemůže stát vlastníkem kabinetu.", unavailable: "Žádost se nepodařilo ověřit. Zkuste to později.", back: "Zpět na služby" },
  en: { title: "Workspace ownership transfer", checking: "Checking the link…", google_required: "Sign in with Google. After your identity is verified, the superadmin will receive an approval request.", googleAction: "Sign in with Google", claiming: "Verifying your account…", pending: "Your account is verified. Waiting for superadmin approval. This page will update automatically.", approved: "Transfer approved. Opening the workspace…", rejected: "The superadmin rejected the workspace transfer.", expired: "This link expired or was revoked.", conflict: "This account cannot become the workspace owner.", unavailable: "Could not check the request. Try again later.", back: "Back to Services" },
};

const errorState = (error: unknown): ViewState => {
  const code = error instanceof Error ? error.message : "";
  if (code.includes("expired") || code.includes("revoked") || code.includes("invalid")) return "expired";
  if (code.includes("same_owner") || code.includes("profile_conflict") || code.includes("role_conflict") || code.includes("candidate_unavailable") || code.includes("owner_changed")) return "conflict";
  return "unavailable";
};

export function BeautyWorkspaceOwnerTransferClaimPage() {
  const language = useAppStore((state: { language: Language }) => state.language) as Language;
  const text = copy[language];
  const token = new URL(window.location.href).searchParams.get("owner_transfer")?.trim() || "";
  const [state, setState] = useState<ViewState>("checking");

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    if (!isBeautyWorkspaceOwnerTransferToken(token)) {
      setState("expired");
      return () => { active = false; };
    }

    const finishApproved = () => {
      const role = resolveCurrentUserRole();
      useAppStore.setState({ userRole: role });
      if (role !== "professional") throw new Error("beauty_owner_transfer_role_refresh_failed");
      setState("approved");
      window.setTimeout(() => window.location.replace("/beauty/workspace"), 350);
    };

    const poll = async () => {
      try {
        const result = await checkBeautyWorkspaceOwnerTransfer(token);
        if (!active) return;
        if (result.status === "approved") { finishApproved(); return; }
        if (result.status === "rejected") { setState("rejected"); return; }
        setState("pending");
        timer = window.setTimeout(() => { void poll(); }, 5000);
      } catch (error) {
        if (active) setState(errorState(error));
      }
    };

    void initializeTrustedAuth().catch(() => null).then(async () => {
      if (!active) return;
      const session = getCurrentAuthSession();
      if (!session || session.source !== "trusted-provider" || session.user.provider !== "google") {
        setState("google_required");
        return;
      }
      setState("claiming");
      try {
        const result = await claimBeautyWorkspaceOwnerTransfer(token);
        if (!active) return;
        if (result.status === "approved") { finishApproved(); return; }
        if (result.status === "rejected") { setState("rejected"); return; }
        setState("pending");
        timer = window.setTimeout(() => { void poll(); }, 5000);
      } catch (error) {
        if (active) setState(errorState(error));
      }
    });

    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [token]);

  const startGoogle = async () => {
    setState("checking");
    try { await beginGoogleWebAuth(window.location.href, "sign-in"); }
    catch { setState("unavailable"); }
  };

  return <main className="beauty-shell"><section className="beauty-card" aria-live="polite">
    <h1>{text.title}</h1>
    <div className="beauty-note"><span>{text[state]}</span></div>
    {state === "google_required" ? <button className="beauty-home-button" type="button" onClick={() => void startGoogle()}>{text.googleAction}</button> : null}
    {state === "rejected" || state === "expired" || state === "conflict" || state === "unavailable" ? <a className="beauty-home-button" href="/services">{text.back}</a> : null}
  </section></main>;
}
