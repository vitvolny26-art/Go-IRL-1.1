import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("SHARE020 City Posters Telegram startapp deep link", () => {
  it("routes city-poster start params to the exact City Posters event", () => {
    expect(app).toContain('startParam?.startsWith("city-poster-")');
    expect(app).toContain('const eventSlug = startParam.slice("city-poster-".length).trim()');
    expect(app).toContain('window.location.assign(\`/city-posters?event=\${encodeURIComponent(eventSlug)}\`)');
  });

  it("does not silently consume the City Posters start param", () => {
    expect(app).not.toContain('if (startParam?.startsWith("city-poster-")) {\n      invitationHandled.current = true;\n      return;');
  });
});
