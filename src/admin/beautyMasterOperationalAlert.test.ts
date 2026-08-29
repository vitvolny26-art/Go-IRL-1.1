import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { beautyMasterAdminRequestUrl, requestedBeautyMasterRequestId } from "./beautyMasterRequests.js";

const requestId = "GROOMING018-bd904925-3b35-45b8-b5aa-a324e79406b7";
const script = readFileSync(new URL("../../google-apps-script/grooming018-master-operational-alert.gs", import.meta.url), "utf8");
const panel = readFileSync(new URL("./BeautyMasterOnboardingPanel.tsx", import.meta.url), "utf8");

describe("GROOMING018 owner operational alert", () => {
  it("builds and restores an exact-request admin deep link", () => {
    const url = beautyMasterAdminRequestUrl(requestId, "https://go-irl.fun");
    expect(url).toBe(`https://go-irl.fun/admin?beauty_request=${requestId}`);
    expect(requestedBeautyMasterRequestId(url)).toBe(requestId);
    expect(panel).toContain("requestedBeautyMasterRequestId()");
  });
  it("keeps Telegram credentials server-side and alerts idempotently", () => {
    expect(script).toContain("PropertiesService.getScriptProperties()");
    expect(script).toContain("GO_IRL_TELEGRAM_BOT_TOKEN");
    expect(script).toContain("grooming018-alert:");
    expect(script).toContain("disable_web_page_preview: true");
    expect(script).not.toContain("VITE_");
  });
  it("states that the admin chat is not the master's identity", () => {
    expect(script).toContain("never the master's communication identity");
  });
});
