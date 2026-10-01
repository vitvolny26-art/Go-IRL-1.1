import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const catalog = readFileSync(resolve(process.cwd(), "src/city-posters/events/CityPostersEventCatalog.tsx"), "utf8");

describe("SHARE019 Festival prepared sharing", () => {
  it("routes Festival Telegram sharing through the prepared City Posters share flow", () => {
    expect(catalog).toContain('import { sharePreparedTelegramCityPostersEvent } from "../../telegramPreparedShare";');
    expect(catalog).toContain("onTelegramShare={() => sharePreparedTelegramCityPostersEvent(row.canonical_slug, language)}");
  });

  it("keeps the shared deep link scoped to the exact Festival event", () => {
    expect(catalog).toContain('const detailsHref = `/city-posters?detail=${encodeURIComponent(row.canonical_slug)}`');
    expect(catalog).toContain("url={new URL(detailsHref, window.location.origin).toString()}");
  });
});
