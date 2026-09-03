import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { UserRole } from "../types";

declare const __GO_IRL_COMMIT__: string;
declare const __GO_IRL_BUILT_AT__: string;

export const adminPanelPath = "/admin/login";
export const shouldShowAdminDevPanel = (userRole: UserRole) => userRole === "admin" || userRole === "superadmin";
export const adminBuildBadgeHeaderSelector = ".app-header .header-controls";
export const adminBuildBadgePosition = {
  right: "calc(env(safe-area-inset-right, 0px) + 6px)",
  top: "calc(env(safe-area-inset-top, 0px) + 6px)",
} as const;

const safeCopy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
};

export function DevPanel() {
  const [open, setOpen] = useState(false);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const commit = typeof __GO_IRL_COMMIT__ === "string" ? __GO_IRL_COMMIT__ : "unknown";
  const builtAt = typeof __GO_IRL_BUILT_AT__ === "string" ? __GO_IRL_BUILT_AT__ : "unknown";

  useEffect(() => {
    const resolve = () => setHeaderTarget(document.querySelector<HTMLElement>(adminBuildBadgeHeaderSelector));
    resolve();
    window.addEventListener("go-irl-header-auth-slot-ready", resolve);
    return () => window.removeEventListener("go-irl-header-auth-slot-ready", resolve);
  }, []);

  const reload = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("refresh", String(Date.now()));
    window.location.replace(url.toString());
  };

  const openAdminPanel = () => {
    window.location.assign(adminPanelPath);
  };

  const debugInfo = {
    app: "GO IRL",
    commit,
    builtAt,
    href: window.location.href,
    userAgent: navigator.userAgent,
  };

  const marker = (
    <button
      id="beta-build-marker"
      type="button"
      onClick={() => setOpen(true)}
      style={{
        zIndex: 99999,
        fontSize: headerTarget ? 10 : 12,
        fontWeight: 700,
        lineHeight: 1,
        background: "#2563eb",
        color: "#fff",
        padding: headerTarget ? "5px 8px" : "5px 10px",
        border: 0,
        borderRadius: 999,
        boxShadow: "0 2px 8px rgba(0,0,0,.28)",
        cursor: "pointer",
        userSelect: "none",
        ...(headerTarget ? {} : { position: "fixed", ...adminBuildBadgePosition }),
      }}
    >
      {commit}
    </button>
  );

  return (
    <>
      <style>{`
        @media (max-width: 959px) {
          .app-header .header-inner { justify-content: flex-start; padding-right: 54px; }
          .app-header .header-controls { flex: 1 1 auto; justify-content: flex-start; }
          .app-header .header-controls > #beta-build-marker {
            position: absolute;
            right: 6px;
            top: 6px;
          }
          .app-header .header-controls > .header-icon-button:last-child {
            position: absolute;
            right: 6px;
            top: 34px;
          }
        }
      `}</style>
      {headerTarget ? createPortal(marker, headerTarget) : marker}

      {open && (
        <div
          id="beta-dev-panel"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100000,
            background: "rgba(0,0,0,.55)",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              background: "#101214",
              color: "#fff",
              borderRadius: "22px 22px 0 0",
              padding: 18,
              fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
              boxShadow: "0 -8px 28px rgba(0,0,0,.35)",
            }}
          >
            <div style={{ width: 42, height: 4, borderRadius: 999, background: "#3a3f46", margin: "0 auto 14px" }} />
            <h3 style={{ margin: "0 0 10px", fontSize: 18 }}>GO IRL DEV</h3>
            <div style={{ fontSize: 13, opacity: .8, marginBottom: 14 }}>
              Commit: <b>{commit}</b><br />
              Built: {builtAt}
            </div>
            <button onClick={reload} style={{ width: "100%", margin: "6px 0", padding: 13, border: 0, borderRadius: 14, background: "#2563eb", color: "#fff", fontWeight: 700 }}>Reload latest build</button>
            <button onClick={openAdminPanel} style={{ width: "100%", margin: "6px 0", padding: 13, border: 0, borderRadius: 14, background: "#20242a", color: "#fff", fontWeight: 700 }}>Админ-панель</button>
            <button onClick={() => safeCopy(commit)} style={{ width: "100%", margin: "6px 0", padding: 13, border: 0, borderRadius: 14, background: "#20242a", color: "#fff" }}>Copy commit</button>
            <button onClick={() => safeCopy(JSON.stringify(debugInfo, null, 2))} style={{ width: "100%", margin: "6px 0", padding: 13, border: 0, borderRadius: 14, background: "#20242a", color: "#fff" }}>Copy debug info</button>
            <button onClick={() => setOpen(false)} style={{ width: "100%", margin: "10px 0 0", padding: 13, border: 0, borderRadius: 14, background: "#30343b", color: "#fff" }}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
