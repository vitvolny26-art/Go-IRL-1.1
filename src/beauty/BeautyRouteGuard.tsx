import { useEffect, useState, type ReactNode } from "react";
import { initializeTrustedAuth } from "../authSession";
import { resolveCurrentUserRole, useAppStore } from "../store";
import type { Language, UserRole } from "../types";
import { BeautyMasterWorkspacePage } from "./BeautyMasterWorkspacePage";
import { BeautyPublicSlugEditor } from "./BeautyPublicSlugEditor";
import { beautyRouteAccess } from "./beautyRouteAccess";
import "./beauty-setup.css";

const accessCopy: Record<Language, { loading: string; title: string; message: string; action: string }> = {
  ru: { loading: "Проверяем доступ…", title: "Доступ ограничен", message: "Кабинет Beauty доступен только мастеру-владельцу. Возвращаем вас в сервисы.", action: "Вернуться в сервисы" },
  uk: { loading: "Перевіряємо доступ…", title: "Доступ обмежено", message: "Кабінет Beauty доступний лише майстру-власнику. Повертаємо вас до сервісів.", action: "Повернутися до сервісів" },
  cs: { loading: "Ověřujeme přístup…", title: "Přístup omezen", message: "Beauty workspace je dostupný pouze profesionálnímu vlastníkovi. Vracíme vás do služeb.", action: "Zpět na služby" },
  en: { loading: "Checking access…", title: "Access denied", message: "The Beauty workspace is available only to its professional owner. Returning you to Services.", action: "Back to Services" },
  pl: { loading: "Checking access…", title: "Access denied", message: "The Beauty workspace is available only to its professional owner. Returning you to Services.", action: "Back to Services" },
  sk: { loading: "Ověřujeme přístup…", title: "Přístup omezen", message: "Beauty workspace je dostupný pouze profesionálnímu vlastníkovi. Vracíme vás do služeb.", action: "Zpět na služby" },
};

const isWorkspaceRoute = () => window.location.pathname.replace(/\/+$/, "") === "/beauty/workspace";

export function BeautyRouteGuard({ children }: { children: ReactNode }) {
  const language = useAppStore((state) => state.language);
  const [role, setRole] = useState<UserRole | null>(null);
  const text = accessCopy[language];

  useEffect(() => {
    let active = true;
    void initializeTrustedAuth().catch(() => null).then(() => {
      if (!active) return;
      const currentRole = resolveCurrentUserRole();
      useAppStore.setState({ userRole: currentRole });
      setRole(currentRole);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!role || beautyRouteAccess(role) === "allowed") return;
    window.history.replaceState(null, "", "/services");
    const redirect = window.setTimeout(() => window.location.replace("/services"), 1800);
    return () => window.clearTimeout(redirect);
  }, [role]);

  if (!role) {
    return <main className="beauty-shell"><div className="beauty-loading" role="status">{text.loading}</div></main>;
  }

  if (beautyRouteAccess(role) === "blocked") {
    return <main className="beauty-shell"><section className="beauty-card" role="alert"><div className="beauty-note"><strong>{text.title}</strong><span>{text.message}</span></div><a className="beauty-home-button" href="/services">{text.action}</a></section></main>;
  }

  return <>{isWorkspaceRoute() ? <BeautyMasterWorkspacePage /> : children}<BeautyPublicSlugEditor /></>;
}
