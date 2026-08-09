import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfilePrivacyCenter } from "./ProfilePrivacyCenter";

const snapshot = {
  displayName: "GO IRL User",
  bio: "",
  cityLabel: "Olomouc",
  avatar: "GI",
  isPublic: true,
  showFavorites: false,
  favoriteLabels: [],
};

describe("ProfilePrivacyCenter account requests", () => {
  it("renders explicit export and deletion actions", () => {
    const html = renderToStaticMarkup(
      <ProfilePrivacyCenter
        language="en"
        snapshot={snapshot}
        saving={false}
        accountRequestPending={null}
        accountRequestResult={null}
        onChange={() => undefined}
        onAccountRequest={() => undefined}
      />,
    );

    expect(html).toContain("Request data export");
    expect(html).toContain("Request account deletion");
    expect(html).toContain("backend-confirmed request");
  });

  it("renders truthful unavailable state with correlation reference", () => {
    const html = renderToStaticMarkup(
      <ProfilePrivacyCenter
        language="en"
        snapshot={snapshot}
        saving={false}
        accountRequestPending={null}
        accountRequestResult={{
          status: "unavailable",
          kind: "data_export",
          correlationId: "corr-123",
          errorCode: "transport_unavailable",
        }}
        onChange={() => undefined}
        onAccountRequest={() => undefined}
      />,
    );

    expect(html).toContain("Nothing was submitted");
    expect(html).toContain("corr-123");
  });

  it("disables both actions while one request is pending", () => {
    const html = renderToStaticMarkup(
      <ProfilePrivacyCenter
        language="en"
        snapshot={snapshot}
        saving={false}
        accountRequestPending="account_deletion"
        accountRequestResult={null}
        onChange={() => undefined}
        onAccountRequest={() => undefined}
      />,
    );

    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain("Submitting request…");
  });
});
