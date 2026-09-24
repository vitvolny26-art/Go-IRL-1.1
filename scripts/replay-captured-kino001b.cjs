'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parsePlanetaKino, parseUkrainianDate, zonedLocalToIso } = require('./kino001b-captured-parsers.cjs');

const root = path.resolve(__dirname, '..');
const fixture = path.join(root, 'evidence/fixtures/uk_kyiv_planetakino.html');
const html = fs.readFileSync(fixture, 'utf8');
const meta = {
  captured_at: '2026-09-20T15:27:57.857Z',
  source_url: 'https://planetakino.ua/schedule/?cinema=cinema-1-uk',
};
const first = parsePlanetaKino(html, meta);
const second = parsePlanetaKino(html, meta);
const encode = value => JSON.stringify(value);
if (encode(first) !== encode(second)) throw new Error('non_deterministic_replay');
if (first.length < 1) throw new Error('no_normalized_screenings');
const forbidden = /subtitle|imdb|tmdb|audio.?language/i;
if (Object.keys(first[0]).some(k => forbidden.test(k))) throw new Error('forbidden_field');

const assertEqual = (actual, expected, label) => {
  if (actual !== expected) throw new Error(`${label}:${actual}!=${expected}`);
};
assertEqual(parseUkrainianDate('5', 'січня', '2026-12-31T22:30:00Z', 'Europe/Kyiv'), '2027-01-05', 'year_rollover');
assertEqual(parseUkrainianDate('5', 'грудня', '2027-01-01T10:00:00Z', 'Europe/Kyiv'), '2026-12-05', 'previous_year_rollover');
assertEqual(zonedLocalToIso('2026-01-15T20:00:00', 'Europe/Kyiv'), '2026-01-15T18:00:00.000Z', 'winter_offset');
assertEqual(zonedLocalToIso('2026-07-15T20:00:00', 'Europe/Kyiv'), '2026-07-15T17:00:00.000Z', 'summer_offset');
let malformedFailedClosed = false;
try { parsePlanetaKino('<html>captcha</html>', meta); } catch (error) { malformedFailedClosed = /^fail_closed:/.test(error.message); }
if (!malformedFailedClosed) throw new Error('malformed_payload_not_fail_closed');

const report = {
  source_id: 'uk_kyiv_planetakino',
  fixture_sha256: crypto.createHash('sha256').update(html).digest('hex'),
  deterministic: true,
  screening_count: first.length,
  normalization_checks: {
    month_year_rollover: true,
    timezone_dst: true,
    malformed_payload_fail_closed: true,
  },
  sample: first[0],
};
console.log(JSON.stringify(report, null, 2));
