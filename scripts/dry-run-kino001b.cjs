'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parsePlanetaKino } = require('./kino001b-captured-parsers.cjs');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'evidence/fixtures/uk_kyiv_planetakino.html'), 'utf8');
const rows = parsePlanetaKino(html, {
  captured_at: '2026-09-20T15:27:57.857Z',
  source_url: 'https://planetakino.ua/schedule/?cinema=cinema-1-uk',
});
const forbidden = /subtitle|imdb|tmdb|audio.?language/i;
for (const row of rows) {
  if (Object.keys(row).some(key => forbidden.test(key))) throw new Error('forbidden_normalized_field');
}
console.log(`dry-run: ${rows.length} normalized Planeta Kino screenings; no writes; forbidden fields absent`);
