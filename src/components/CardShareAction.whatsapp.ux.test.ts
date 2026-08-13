import { describe, expect, it } from "vitest";
import source from "./CardShareAction.tsx?raw";

describe("WhatsApp prepared share UX", () => {
  it("prepares the server JPEG before showing the modal", () => {
    const handler = source.slice(
      source.indexOf("const prepareWhatsAppCard = async () =>"),
      source.indexOf("const share = async"),
    );
    expect(handler).toContain("buildCardShareImageUrl(content)");
    expect(handler).toContain("buildCardShareDownloadUrl(content)");
    expect(handler).toContain('response.headers.get("content-type")');
    expect(handler).toContain('contentType !== "image/jpeg"');
    expect(handler).toContain("blob.size === 0");
    expect(handler).toContain("blob.size > maxPreparedWhatsAppImageBytes");
    expect(handler).toContain("const file = new File(");
    expect(handler).toContain("directSend: canNativeShareFile(file)");
    expect(handler).toContain("downloadAccepted: false");
    expect(handler).not.toContain("openExternalShareTarget");
  });

  it("binds card preparation directly to the WhatsApp channel button", () => {
    const channelClick = source.slice(
      source.indexOf('if (channel.id === "whatsapp")'),
      source.indexOf("</button>", source.indexOf('if (channel.id === "whatsapp")')),
    );
    expect(channelClick).toContain("void prepareWhatsAppCard()");
    expect(channelClick).not.toContain("openExternalShareTarget");
  });

  it("detects native file sharing generically for Activity and Beauty JPEGs", () => {
    const capability = source.slice(
      source.indexOf("const canNativeShareFile = (file: File) =>"),
      source.indexOf("const prepareWhatsAppCard = async () =>"),
    );
    expect(capability).not.toContain("canPrepareBeautyTelegramShare(url)");
    expect(capability).toContain('typeof navigator.share !== "function"');
    expect(capability).toContain('typeof navigator.canShare !== "function"');
    expect(capability).toContain("navigator.canShare({ files: [file] })");
  });

  it("attaches the JPEG and caption through the native share sheet", () => {
    const handler = source.slice(
      source.indexOf("const openPreparedWhatsApp = async () =>"),
      source.indexOf("const activate = () =>"),
    );
    expect(handler).toContain('typeof navigator.share === "function"');
    expect(handler).toContain("await navigator.share({ files: [prepared.file], title, text: prepared.text })");
    expect(handler).toContain('error.name === "AbortError"');
    expect(handler).toContain("directSend: false");
    expect(handler).toContain("error: null");
  });

  it("keeps manual download and wa.me only as the unsupported-device fallback", () => {
    const download = source.slice(
      source.indexOf("const downloadPreparedWhatsApp = () =>"),
      source.indexOf("const openPreparedWhatsApp = async () =>"),
    );
    const open = source.slice(
      source.indexOf("const openPreparedWhatsApp = async () =>"),
      source.indexOf("const activate = () =>"),
    );
    expect(download).toContain("webApp.downloadFile(");
    expect(download).toContain("URL.createObjectURL(prepared.file)");
    expect(open).not.toContain("!prepared.directSend && !prepared.downloadAccepted");
    expect(open).toContain("https://wa.me/?text=");
  });

  it("shows compact fallback guidance when native attachment is unavailable", () => {
    const modal = source.slice(
      source.indexOf('className="whatsapp-share-prepared-backdrop"'),
      source.indexOf("document.body,", source.indexOf('className="whatsapp-share-prepared-backdrop"')),
    );
    expect(modal).toContain("!preparedWhatsApp.directSend ? (");
    expect(modal).toContain("whatsappCopy.fallbackHint");
    expect(modal).not.toContain("disabled={!preparedWhatsApp.directSend && !preparedWhatsApp.downloadAccepted}");
    expect(modal).toContain("void openPreparedWhatsApp()");
  });

  it("labels native file sharing generically and keeps WhatsApp wording for fallback", () => {
    expect(source).toContain('share: "Поделиться"');
    expect(source).toContain('open: "Отправить в WhatsApp"');
    expect(source).toContain('download: "Скачать JPEG"');
    expect(source).toContain("fallbackHint");
    expect(source).toContain("preparedWhatsApp.directSend ? whatsappCopy.share : whatsappCopy.open");
  });
});
