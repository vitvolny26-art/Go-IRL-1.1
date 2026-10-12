import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MyTeamsSummary } from "./MyTeamsSummary";
import { CreateNamedTeamForm } from "./CreateNamedTeamForm";
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

describe("People003A team creation form", () => {
  it("renders the accessible Russian create-team action", () => {
    const html = renderToStaticMarkup(<CreateNamedTeamForm language="ru" onCreate={async () => {}} />);
    expect(html).toContain('aria-label="Название команды"');
    expect(html).toContain('maxLength="80"');
    expect(html).toContain("Создать команду");
  });

  it("renders the English create-team action", () => {
    const html = renderToStaticMarkup(<CreateNamedTeamForm language="en" onCreate={async () => {}} />);
    expect(html).toContain("Create team");
  });
});
