import { useEffect, useState } from "react";
import { beginGoogleWebAuth } from "../auth/googleWebAuth";
import { claimBeautyMasterOnboarding, isBeautyMasterClaimToken } from "../auth/beautyMasterClaim";
import { getCurrentAuthSession, initializeTrustedAuth } from "../authSession";
import { resolveCurrentUserRole, useAppStore } from "../store";
import type { Language } from "../types";
import "./beauty-setup.css";

const copy: Record<Language, {
  checking: string;
  title: string;
  googleRequired: string;
  googleAction: string;
  claiming: string;
  success: string;
  invalid: string;
  expired: string;
  conflict: string;
  unavailable: string;
  back: string;
}> = {
  ru: { checking: "Проверяем ссылку…", title: "Получить кабинет мастера", googleRequired: "Чтобы получить подготовленный кабинет, войдите через Google. Ссылка одноразовая.", googleAction: "Войти через Google", claiming: "Загружаем данные заявки в кабинет…", success: "Кабинет получен. Открываем черновик…", invalid: "Ссылка недействительна или уже использована.", expired: "Срок действия ссылки истёк или она была отозвана.", conflict: "Этот Google-аккаунт нельзя привязать к данному кабинету. Обратитесь к администратору.", unavailable: "Не удалось получить кабинет. Повторите позже или обратитесь к администратору.", back: "Вернуться в сервисы" },
  uk: { checking: "Перевіряємо посилання…", title: "Отримати кабінет майстра", googleRequired: "Щоб отримати підготовлений кабінет, увійдіть через Google. Посилання одноразове.", googleAction: "Увійти через Google", claiming: "Завантажуємо дані заявки до кабінету…", success: "Кабінет отримано. Відкриваємо чернетку…", invalid: "Посилання недійсне або вже використане.", expired: "Термін дії посилання минув або його відкликано.", conflict: "Цей Google-акаунт не можна прив’язати до цього кабінету. Зверніться до адміністратора.", unavailable: "Не вдалося отримати кабінет. Спробуйте пізніше або зверніться до адміністратора.", back: "Повернутися до сервісів" },
  cs: { checking: "Kontrolujeme odkaz…", title: "Převzít profesionální kabinet", googleRequired: "Pro převzetí připraveného kabinetu se přihlaste přes Google. Odkaz je jednorázový.", googleAction: "Přihlásit přes Google", claiming: "Načítáme údaje žádosti do kabinetu…", success: "Kabinet byl převzat. Otevíráme koncept…", invalid: "Odkaz je neplatný nebo již byl použit.", expired: "Platnost odkazu vypršela nebo byl odvolán.", conflict: "Tento Google účet nelze spojit s tímto kabinetem. Kontaktujte administrátora.", unavailable: "Kabinet se nepodařilo převzít. Zkuste to později nebo kontaktujte administrátora.", back: "Zpět na služby" },
  en: { checking: "Checking the link…", title: "Claim professional workspace", googleRequired: "Sign in with Google to claim the prepared workspace. This is a one-time link.", googleAction: "Sign in with Google", claiming: "Loading your application into the workspace…", success: "Workspace claimed. Opening the draft…", invalid: "This link is invalid or has already been used.", expired: "This link has expired or was revoked.", conflict: "This Google account cannot claim this workspace. Contact the administrator.", unavailable: "The workspace could not be claimed. Try again later or contact the administrator.", back: "Back to Services" },
};

type ClaimState = "checking" | "google_required" | "claiming" | "success" | "invalid" | "expired" | "conflict" | "unavailable";

const claimStateForError = (error: unknown): ClaimState => {
  const code = error instanceof Error ? error.message : "";
  if (code.includes("expired_or_revoked")) return "expired";
  if (code.includes("already_claimed") || code.includes("invalid")) return "invalid";
  if (code.includes("role_conflict") || code.includes("profile_conflict") || code.includes("user_unavailable")) return "conflict";
  return "unavailable";
};

export function BeautyMasterClaimPage() {
  const language = useAppStore((state) => state.language);
  const [state, setState] = useState<ClaimState>("checking");
  const text = copy[language];
  const token = new URL(window.location.href).searchParams.get("token")?.trim() || "";

  useEffect(() => {
    let active = true;
    if (!isBeautyMasterClaimToken(token)) {
      setState("invalid");
      return () => { active = false; };
    }

    void initializeTrustedAuth()
      .catch(() => null)
      .then(async () => {
        if (!active) return;
        const session = getCurrentAuthSession();
        if (!session || session.source !== "trusted-provider" || session.user.provider !== "google") {
          setState("google_required");
          return;
        }
        setState("claiming");
        try {
          await claimBeautyMasterOnboarding(token);
          if (!active) return;
          const role = resolveCurrentUserRole();
          useAppStore.setState({ userRole: role });
          if (role !== "professional") throw new Error("beauty_master_claim_role_refresh_failed");
          setState("success");
          window.location.replace("/beauty/workspace");
        } catch (error) {
          if (active) setState(claimStateForError(error));
        }
      });

    return () => { active = false; };
  }, [token]);

  const startGoogle = async () => {
    setState("checking");
    try {
      await beginGoogleWebAuth(window.location.href, "sign-in");
    } catch {
      setState("unavailable");
    }
  };

  const message = state === "checking" ? text.checking
    : state === "claiming" ? text.claiming
      : state === "success" ? text.success
        : state === "invalid" ? text.invalid
          : state === "expired" ? text.expired
            : state === "conflict" ? text.conflict
              : state === "unavailable" ? text.unavailable
                : text.googleRequired;

  return <main className="beauty-shell">
    <section className="beauty-card" aria-live="polite">
      <h1>{text.title}</h1>
      <div className="beauty-note"><span>{message}</span></div>
      {state === "google_required" ? <button className="beauty-home-button" type="button" onClick={() => void startGoogle()}>{text.googleAction}</button> : null}
      {state === "invalid" || state === "expired" || state === "conflict" || state === "unavailable"
        ? <a className="beauty-home-button" href="/services">{text.back}</a>
        : null}
    </section>
  </main>;
}
