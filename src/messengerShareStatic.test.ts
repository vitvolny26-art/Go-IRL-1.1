import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rootStaticFiles } from "../vite.config";

describe("Messenger HTTPS share bridge build contract", () => {
  it("emits the Messenger bridge as a root-level static asset", () => {
    expect(rootStaticFiles).toContain("messenger-share.html");
    const source = readFileSync(new URL("../public/messenger-share.html", import.meta.url), "utf8");
    expect(source).toContain("<!doctype html>");
    expect(source).toContain("GO IRL — Share");
    expect(source).toContain('imageUrl.pathname !== "/api/meta/event-preview"');
    expect(source).toContain('imageUrl.searchParams.get("format") !== "download"');
    expect(source).toContain('contentType !== "image/jpeg"');
    expect(source).toContain("new File([blob], \"go-irl-card.jpg\", { type: \"image/jpeg\" })");
    expect(source).toContain("navigator.canShare({ files: [imageFile] })");
    expect(source).toContain("navigator.share(shareData)");
    expect(source).toContain('let invitationCopied = false');
    expect(source).toContain('shareButton.textContent = invitationCopied && content.url ? t.shareImage : t.copyFirst');
    expect(source).toContain('if (!invitationCopied)');
    expect(source).toContain('status.textContent = t.copiedNext');
    expect(source).toContain('status.textContent = t.pasteAfterShare');
    expect(source).toContain('document.execCommand("copy") === true');
    expect(source).toContain('return copied');
    expect(source).toContain("Download JPEG");
    expect(source).toContain("attach it in Messenger");
  });
});
