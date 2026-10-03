import { describe, expect, it, vi } from "vitest";
import { cinestarCzAdapter } from "./cinestar-cz.js";
import type { CinemaRawSnapshotPayload, CinemaSourceConfig } from "../cinema-ingestion-types.js";

const source: CinemaSourceConfig = {
  id: "00000000-0000-0000-0000-000000000011",
  venue_id: "00000000-0000-0000-0000-000000000012",
  source_id: "cinestar_cz",
  adapter_key: "cinestar_cz",
  source_url: "https://cinestar.cz/cz/olomouc/",
  fetch_method: "html",
  parser_version: "1.0.0",
  timezone: "Europe/Prague",
  enabled: false,
  fetch_interval_minutes: 1440,
  expected_horizon_days: 1,
  min_records: 1,
  config: {},
};

const moviePage = `
<html><head>
  <meta property="og:image" content="/media/magicka-posedlost-2.jpg">
  <meta name="description" content="Pokračování magického příběhu.">
</head><body>
  <h1>Magická posedlost 2 TITULKY</h1>
  <div>130 min.</div>
  <div>Originální název: Magic Obsession 2</div>
  <div>Žánr: Fantasy / Drama</div>
  <div>Země: USA</div>
  <div>Jazyk: en</div>
  <div>Přístupnost: 12+</div>
  <div>Režie: Alice Director</div>
  <div>Hrají: Actor One, Actor Two</div>
  <section id="program">
    <div>12. 9. 2026</div>
    <div>PREMIUM</div>
    <div><img alt="Titulky" /></div>
    <div>7.1</div>
    <div>4K</div>
    <button data-performance-id="99001">18:00</button>

    <div>STANDARD</div>
    <div><img alt="Titulky" /></div>
    <div>7.1</div>
    <button data-performance-id="99002">12:40</button>
    <button data-performance-id="99003">15:20</button>
  </section>
</body></html>`;

const payload: CinemaRawSnapshotPayload = {
  adapter_key: "cinestar_cz",
  fetched_at: "2026-09-12T08:00:00.000Z",
  root_url: "https://cinestar.cz/cz/olomouc/filmy",
  pages: [
    {
      url: "https://cinestar.cz/cz/olomouc/filmy",
      status: 200,
      body: "<a href='/cz/olomouc/filmy/movie/10688-magicka-posedlost-2'>Magická posedlost 2</a>",
    },
    {
      url: "https://cinestar.cz/cz/olomouc/filmy/movie/10688-magicka-posedlost-2",
      status: 200,
      body: moviePage,
    },
  ],
  failures: [],
};

describe("cinestarCzAdapter", () => {
  it("keeps adjacent auditorium/format segments isolated", () => {
    const result = cinestarCzAdapter.parseSnapshot(source, payload);
    expect(result.scope_complete).toBe(true);
    expect(result.records_valid).toBe(3);
    expect(result.records_rejected).toBe(0);

    expect(result.rows[0]).toMatchObject({
      external_screening_id: "99002",
      external_movie_id: "10688",
      title: "Magická posedlost 2",
      duration_minutes: 130,
      original_title: "Magic Obsession 2",
      poster_url: "https://cinestar.cz/media/magicka-posedlost-2.jpg",
      genres: ["Fantasy", "Drama"],
      countries: ["USA"],
      original_language: "en",
      age_rating: "12+",
      description: "Pokračování magického příběhu.",
      director: "Alice Director",
      lead_actors: ["Actor One", "Actor Two"],
      starts_at_local: "2026-09-12T12:40:00",
      starts_at: "2026-09-12T10:40:00.000Z",
      auditorium: "STANDARD",
      version_type: "subtitled",
      subtitle_languages: ["cs"],
      audio_type: "7.1",
      format: "2D",
    });

    const premium = result.rows.find((row) => row.external_screening_id === "99001");
    expect(premium).toMatchObject({
      starts_at_local: "2026-09-12T18:00:00",
      auditorium: "PREMIUM",
      audio_type: "7.1",
      format: "4K",
    });
    expect(result.rows.find((row) => row.external_screening_id === "99002")?.screening_tags)
      .not.toContain("4K");
  });

  it("discovers movie pages serialized in the Nuxt SSR payload", async () => {
    const originalFetch = globalThis.fetch;
    const requested: string[] = [];
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("/filmy")) {
        return new Response(`
          <a href="/cz/olomouc/filmy/movie/11012-tango-pro-3">Tango pro 3</a>
          <script>window.__NUXT__={data:["filmy\\u002Fmovie\\u002F10696-bardotky","\\u002Fcz\\u002Folomouc\\u002Ffilmy\\u002Fmovie\\u002F11094-queen-budapest"]}</script>
        `, { status: 200 });
      }
      return new Response(moviePage, { status: 200 });
    }) as typeof fetch;
    try {
      const snapshot = await cinestarCzAdapter.fetchSnapshot(source);
      expect(snapshot.failures).toEqual([]);
      expect(snapshot.pages).toHaveLength(4);
      expect(requested).toEqual(expect.arrayContaining([
        "https://cinestar.cz/cz/olomouc/filmy/movie/10696-bardotky",
        "https://cinestar.cz/cz/olomouc/filmy/movie/11012-tango-pro-3",
        "https://cinestar.cz/cz/olomouc/filmy/movie/11094-queen-budapest",
      ]));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("quarantines partial fetches instead of making them writable", () => {
    const partial = cinestarCzAdapter.parseSnapshot(source, {
      ...payload,
      failures: [{ url: "https://cinestar.cz/cz/olomouc/filmy/movie/99999-missing", error: "http_503" }],
    });
    expect(partial.records_valid).toBe(3);
    expect(partial.fetch_complete).toBe(false);
    expect(partial.scope_complete).toBe(false);
  });

  it("replays to identical fallback screening fingerprints", () => {
    const first = cinestarCzAdapter.parseSnapshot(source, payload);
    const second = cinestarCzAdapter.parseSnapshot(source, payload);
    expect(second.rows.map((row) => row.screening_fingerprint))
      .toEqual(first.rows.map((row) => row.screening_fingerprint));
  });

  it("scopes fallback fingerprints to the venue", () => {
    const first = cinestarCzAdapter.parseSnapshot(source, payload);
    const second = cinestarCzAdapter.parseSnapshot({
      ...source,
      id: "00000000-0000-0000-0000-000000000013",
      venue_id: "00000000-0000-0000-0000-000000000014",
    }, payload);
    expect(second.rows.map((row) => row.screening_fingerprint))
      .not.toEqual(first.rows.map((row) => row.screening_fingerprint));
  });

  it("collapses duplicate venue screenings and prefers stable external identity", () => {
    const duplicatePayload: CinemaRawSnapshotPayload = {
      ...payload,
      pages: payload.pages.map((page) => page.url.includes("/movie/10688-")
        ? {
            ...page,
            body: page.body.replace(
              '<button data-performance-id="99001">18:00</button>',
              '<button>18:00</button><button data-performance-id="99001">18:00</button>',
            ),
          }
        : page),
    };
    const result = cinestarCzAdapter.parseSnapshot(source, duplicatePayload);
    expect(result.records_valid).toBe(3);
    expect(result.rows.find((row) => row.starts_at_local === "2026-09-12T18:00:00")?.external_screening_id)
      .toBe("99001");
  });

  it("collapses the same external screening exposed by multiple variant pages", () => {
    const variantPayload: CinemaRawSnapshotPayload = {
      ...payload,
      pages: [
        payload.pages[0],
        payload.pages[1],
        {
          ...payload.pages[1],
          url: "https://cinestar.cz/cz/olomouc/filmy/movie/10688-magicka-posedlost-2-dabing",
          body: moviePage.replace(/TITULKY/g, "DABING").replace(/Titulky/g, "Dabing"),
        },
      ],
    };
    const result = cinestarCzAdapter.parseSnapshot(source, variantPayload);
    expect(result.records_valid).toBe(3);
    expect(result.metrics.duplicates_collapsed).toBe(3);
  });

  it("keeps distinct external screenings even when their fallback fingerprints match", () => {
    const distinctPayload: CinemaRawSnapshotPayload = {
      ...payload,
      pages: payload.pages.map((page) => page.url.includes("/movie/10688-")
        ? {
            ...page,
            body: page.body.replace(
              '<button data-performance-id="99001">18:00</button>',
              '<button data-performance-id="99001">18:00</button><button data-performance-id="99004">18:00</button>',
            ),
          }
        : page),
    };
    const result = cinestarCzAdapter.parseSnapshot(source, distinctPayload);
    expect(result.records_valid).toBe(4);
    expect(result.rows.filter((row) => row.starts_at_local === "2026-09-12T18:00:00")
      .map((row) => row.external_screening_id)).toEqual(["99001", "99004"]);
  });

  it("limits output to fetched date through expected horizon", () => {
    const horizonSource = { ...source, expected_horizon_days: 2 };
    const horizonPayload: CinemaRawSnapshotPayload = {
      ...payload,
      pages: [
        payload.pages[0],
        {
          url: "https://cinestar.cz/cz/olomouc/filmy/movie/10688-magicka-posedlost-2",
          status: 200,
          body: `
            <h1>Magická posedlost 2</h1>
            <div>11. 9. 2026</div><button data-performance-id="98001">10:00</button>
            <div>12. 9. 2026</div><button data-performance-id="98002">10:00</button>
            <div>13. 9. 2026</div><button data-performance-id="98003">10:00</button>
            <div>14. 9. 2026</div><button data-performance-id="98004">10:00</button>
          `,
        },
      ],
    };
    const result = cinestarCzAdapter.parseSnapshot(horizonSource, horizonPayload);
    expect(result.scope_complete).toBe(true);
    expect(result.records_valid).toBe(2);
    expect(result.min_schedule_date).toBe("2026-09-12");
    expect(result.max_schedule_date).toBe("2026-09-13");
    expect(result.expected_until).toBe("2026-09-13");
    expect(result.metrics.filtered_outside_horizon).toBe(2);
  });
});
