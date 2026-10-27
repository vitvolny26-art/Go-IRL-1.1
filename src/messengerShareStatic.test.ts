import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
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
    // Messenger ignores text sent alongside a JPEG file. Link and image
    // must use separate native share invocations, not clipboard as step one.
    expect(source).toContain('<button id="share-link" type="button">');
    expect(source).toContain('shareLinkButton.addEventListener("click", async () => {');
    expect(source).toContain('await navigator.share({ title: `GO IRL: ${content.title}`, url: content.url });');
    expect(source).toContain('const shareData = { files: [imageFile], title: `GO IRL: ${content.title}` };');
    expect(source).toContain('shareButton.disabled = !imageFile');
    expect(source).not.toContain('let invitationCopied = false');
    expect(source).not.toContain('shareButton.textContent = invitationCopied');
    expect(source).not.toContain('files: [imageFile], title: `GO IRL: ${content.title}`, text');
    expect(source).toContain('document.execCommand("copy") === true');
    expect(source).toContain('return copied');
    expect(source).toContain("Download JPEG");
    expect(source).toContain("attach it in Messenger");
    expect(source).toContain("Copy the invitation and paste it into Messenger.");
  });

  it("shares the exact event link and JPEG in independent Android share actions", async () => {
    const source = readFileSync(new URL("../public/messenger-share.html", import.meta.url), "utf8");
    const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    if (!script) throw new Error("Messenger bridge inline script missing");

    const listeners = new Map<string, () => Promise<void>>();
    const nodes = Object.fromEntries(
      ["#share-link", "#share", "#status", "#hint", "#heading", "#download", "#open-messenger", "#copy", "#event-title", "#event-details"].map((id) => [id, {
        textContent: "",
        disabled: id === "#share",
        hidden: false,
        addEventListener(name: string, callback: () => Promise<void>) {
          listeners.set(`${id}:${name}`, callback);
        },
      }]),
    );
    const shared: Record<string, unknown>[] = [];
    const eventUrl = "https://go-irl.fun/Vol260816_a/ru?source=messenger&medium=message";
    const image = "https://go-irl.fun/api/meta/event-preview?event=test&format=download";
    const params = new URLSearchParams({ title: "Volleyball", url: eventUrl, image });
    class TestURL extends URL {
      static createObjectURL() { return "blob:test"; }
      static revokeObjectURL() { /* Nothing to release. */ }
    }
    class TestFile {
      readonly type = "image/jpeg";
    }
    runInNewContext(script, {
      navigator: {
        language: "ru",
        share: async (payload: Record<string, unknown>) => { shared.push(payload); },
        canShare: () => true,
      },
      document: {
        documentElement: { lang: "" },
        querySelector: (id: string) => nodes[id],
      },
      window: { addEventListener: () => {} },
      location: { origin: "https://go-irl.fun", search: `?${params}` },
      fetch: async () => ({
        ok: true,
        headers: { get: () => "image/jpeg" },
        blob: async () => ({ size: 4 }),
      }),
      URL: TestURL,
      URLSearchParams,
      File: TestFile,
    }, { timeout: 1000 });

    const sendLink = listeners.get("#share-link:click");
    const sendJpeg = listeners.get("#share:click");
    expect(sendLink).toBeDefined();
    expect(sendJpeg).toBeDefined();
    await sendLink?.();
    expect(shared[0]).toMatchObject({ url: eventUrl });
    expect(shared[0]).not.toHaveProperty("files");

    // Let the JPEG fetch finish; it must not affect the link-only payload.
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await sendJpeg?.();
    expect(shared[1]).toHaveProperty("files");
    expect(shared[1]).not.toHaveProperty("url");
    expect(shared[1]).not.toHaveProperty("text");
  });
});
