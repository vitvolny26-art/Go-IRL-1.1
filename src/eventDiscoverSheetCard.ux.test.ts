import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const artworkSource = readFileSync(new URL("./components/EventCardArtwork.tsx", import.meta.url), "utf8");
const discoverCss = readFileSync(new URL("./event-discover-sheet-card.css", import.meta.url), "utf8");

describe("Activ008 discover artwork", () => {
  it("provides the 9x16 sheet artwork as the Discover card background", () => {
    expect(artworkSource).toContain("getEventSheetBackground");
    expect(artworkSource).toContain('"--event-discover-background"');
    expect(discoverCss).toContain(".horizontal-events .compact-sport-card .glass-event-card-artwork");
    expect(discoverCss).toContain("background: var(--event-discover-background)");
    expect(discoverCss).toContain("opacity: 0 !important");
  });
});
