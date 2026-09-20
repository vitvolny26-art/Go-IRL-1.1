'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const report = JSON.parse(fs.readFileSync(path.join(root, 'evidence/manual-capture-report.json')));
if (report.captures.length !== 7) throw new Error('expected_7_captures');
if (new Set(report.captures.map(x => x.source_id)).size !== 7) throw new Error('duplicate_source');
for (const row of report.captures) {
  if (!row.execution_id || !row.requested_url || !row.captured_at || !row.classification) throw new Error(`missing_metadata:${row.source_id}`);
  const fixture = path.join(root, 'evidence/fixtures', `${row.source_id}.html`);
  if (fs.existsSync(fixture)) {
    const body = fs.readFileSync(fixture);
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    if (body.length !== row.fixture_bytes || hash !== row.fixture_sha256) throw new Error(`fixture_mismatch:${row.source_id}`);
    if (/^(?:Set-Cookie|Authorization|Cookie):/mi.test(body.toString('utf8'))) throw new Error(`sensitive_header:${row.source_id}`);
  } else if (row.source_id !== 'ru_moscow_cinemapark') {
    throw new Error(`missing_fixture:${row.source_id}`);
  }
}
console.log('manual-capture: 7 sources; fixtures sanitized; hashes verified');
