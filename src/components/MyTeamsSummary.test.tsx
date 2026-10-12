import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MyTeamsSummary } from "./MyTeamsSummary";
import type { OwnTeamSummary } from "../people/ownTeams";

const teams: OwnTeamSummary[] = [{
  team: { id: "one", name: "Hikers", ownerUserKey: "alice", visibility: "private", createdAt: "", updatedAt: "" },
  membership: { teamId: "one", userKey: "alice", role: "owner", status: "active", updatedAt: "" },
}, {
  team: { id: "two", name: "Cyclists", ownerUserKey: "bob", visibility: "private", createdAt: "", updatedAt: "" },
  membership: { teamId: "two", userKey: "alice", role: "member", status: "invited", updatedAt: "" },
}];

describe("People003A My Teams presentation", () => {
  it("renders an accessible empty state", () => {
    const html = renderToStaticMarkup(<MyTeamsSummary language="ru" teams={[]} />);
    expect(html).toContain("Мои команды");
    expect(html).toContain("Пока нет команд");
  });

  it("shows own role and pending invitation without write controls", () => {
    const html = renderToStaticMarkup(<MyTeamsSummary language="ru" teams={teams} />);
    expect(html).toContain("Hikers");
    expect(html).toContain("Владелец");
    expect(html).toContain("Cyclists");
    expect(html).toContain("Приглашение ожидает ответа");
    expect(html).not.toContain("<button");
  });
});
