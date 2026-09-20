'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parsePlanetaKino } = require('./kino001b-captured-parsers.cjs');

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
const report = {
  source_id: 'uk_kyiv_planetakino',
  fixture_sha256: crypto.createHash('sha256').update(html).digest('hex'),
  deterministic: true,
  screening_count: first.length,
  sample: first[0],
};
console.log(JSON.stringify(report, null, 2));
