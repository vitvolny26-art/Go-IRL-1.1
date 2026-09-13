import { useEffect } from "react";
import "./ProductDomainTabs.css";

export type ProductDomain = "services" | "city-posters" | "activities";

const domainPaths: Record<ProductDomain, string> = {
  services: "/services",
  "city-posters": "/city-posters",
  activities: "/activities",
};

const normalizePath = (pathname: string) => pathname.replace(/\/+$/, "") || "/";

export const resolveProductDomain = (pathname: string): ProductDomain | null => {
  const normalized = normalizePath(pathname);
  if (normalized === "/services") return "services";
  if (normalized === "/city-posters") return "city-posters";
  if (normalized === "/activities") return "activities";
  return null;
};

export const openProductDomain = (domain: ProductDomain) => {
  const targetPath = domainPaths[domain];
  if (normalizePath(window.location.pathname) === targetPath) return;
  window.location.assign(targetPath);
};

export function ProductDomainTabs({ activeDomain }: { activeDomain?: ProductDomain }) {
  const currentDomain = activeDomain ?? resolveProductDomain(window.location.pathname);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("go-irl-product-domain-tabs");
    return () => root.classList.remove("go-irl-product-domain-tabs");
  }, []);

  return (
    <nav className="product-domain-tabs" aria-label="GO IRL domains">
      <button
        type="button"
        className={currentDomain === "services" ? "active" : ""}
        aria-current={currentDomain === "services" ? "page" : undefined}
        onClick={() => openProductDomain("services")}
      >
        Service
      </button>
      <button
        type="button"
        className={currentDomain === "city-posters" ? "active" : ""}
        aria-current={currentDomain === "city-posters" ? "page" : undefined}
        onClick={() => openProductDomain("city-posters")}
      >
        City Posters
      </button>
      <button
        type="button"
        className={currentDomain === "activities" ? "active" : ""}
        aria-current={currentDomain === "activities" ? "page" : undefined}
        onClick={() => openProductDomain("activities")}
      >
        Activity
      </button>
    </nav>
  );
}
