import { describe, expect, it } from "vitest";
import source from "./CardShareAction.tsx?raw";

describe("Messenger prepared share UX", () => {
  it("prepares the same validated JPEG before any Messenger handoff", () => {
    const handler = source.slice(
      source.indexOf("const prepareMessengerCard = async () =>"),
      source.indexOf("const share = async"),
    );
    expect(handler).toContain("buildCardShareDownloadUrl(content)");
    expect(handler).toContain("const prepared = await prepareCardShareFile(downloadUrl)");
    expect(handler).toContain("directSend: false");
    expect(handler).not.toContain("openMessengerShareTarget");
  });

  it("binds Messenger to prepared-card UX instead of direct link sharing", () => {
    const channelClick = source.slice(
      source.indexOf('if (channel.id === "whatsapp")'),
      source.indexOf("</button>", source.indexOf('if (channel.id === "whatsapp")')),
    );
    expect(channelClick).toContain('channel.id === "messenger"');
    expect(channelClick).toContain("void prepareMessengerCard()");
  });

  it("routes Telegram to the external Messenger bridge and Android to the app intent", () => {
    const open = source.slice(
      source.indexOf("const openPreparedMessenger = async () =>"),
      source.indexOf("const openPreparedWhatsApp = async () =>"),
    );
    expect(open).toContain("getTelegramWebApp()?.openLink");
    expect(open).toContain("openExternalShareTarget(buildMessengerShareBridgeTarget(content))");
    expect(open).toContain("buildMessengerAndroidIntentTarget(content)");
    expect(open).toContain('typeof navigator.share === "function"');
    expect(open).toContain("navigator.share({ files: [prepared.file], text: prepared.text })");
    expect(open).not.toContain("openMessengerShareTarget");
  });

  it("retains JPEG download and visible copy fallback without claiming delivery", () => {
    const download = source.slice(
      source.indexOf("const downloadPreparedMessenger = () =>"),
      source.indexOf("const openPreparedMessenger = async () =>"),
    );
    const open = source.slice(
      source.indexOf("const openPreparedMessenger = async () =>"),
      source.indexOf("const openPreparedWhatsApp = async () =>"),
    );
    expect(download).toContain("URL.createObjectURL(prepared.file)");
    expect(download).toContain("prepared.shareAlias}.jpg");
    expect(open).toContain("await copyShareText(prepared.text)");
    expect(open).toContain("error: messengerCopy.fallbackHint");
    expect(open).toContain('error.name === "AbortError"');
    expect(source).toContain("!preparedMessenger.directSend ? (");
  });

  it("shows localized RU/UK/CS/EN Messenger copy and the Messenger icon", () => {
    expect(source).toContain("const messengerLabels = {");
    for (const language of ["ru", "uk", "cs", "en", "pl", "sk"]) {
      expect(source).toContain(`${language}: {`);
    }
    expect(source).toContain('<img src="/icons/messenger.svg" alt="" />');
    expect(source).toContain("{messengerCopy.open}");
  });
});
