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

  it("opens the Messenger recipient chooser without navigator.share URL handling", () => {
    const handler = source.slice(
      source.indexOf("const openPreparedMessenger = async () =>"),
      source.indexOf("const activate = () =>"),
    );
    expect(handler).not.toContain("navigator.share");
    expect(handler).toContain("openMessengerShareTarget({ ...content, url: prepared.text })");
  });

  it("keeps download plus Messenger bridge as the unsupported-device fallback", () => {
    const download = source.slice(
      source.indexOf("const downloadPreparedMessenger = () =>"),
      source.indexOf("const openPreparedMessenger = async () =>"),
    );
    const open = source.slice(
      source.indexOf("const openPreparedMessenger = async () =>"),
      source.indexOf("const activate = () =>"),
    );
    expect(download).toContain("URL.createObjectURL(prepared.file)");
    expect(download).toContain("`${prepared.shareAlias}.jpg`");
    expect(open).toContain("openMessengerShareTarget({ ...content, url: prepared.text })");
    expect(source).toContain("!preparedMessenger.directSend ? (");
  });

  it("shows localized RU/UK/CS/EN Messenger copy and the Messenger icon", () => {
    expect(source).toContain("const messengerLabels = {");
    for (const language of ["ru", "uk", "cs", "en"]) {
      expect(source).toContain(`${language}: {`);
    }
    expect(source).toContain('<img src="/icons/messenger.svg" alt="" />');
    expect(source).toContain("{messengerCopy.open}");
  });
});
