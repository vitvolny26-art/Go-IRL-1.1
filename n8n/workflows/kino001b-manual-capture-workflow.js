import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const manualInput = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'MANUAL Capture Input',
    parameters: {
      httpMethod: 'POST',
      path: 'kino001b-manual-capture',
      authentication: 'none',
      responseMode: 'lastNode',
      responseData: 'firstEntryJson',
    },
    position: [220, 300],
  },
  output: [{ body: { source_id: 'ru_moscow_karo' } }],
});

const resolveSource = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Resolve Official Source',
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: `const sourceId = $json.body?.source_id;
const sources = {
  ru_moscow_karo: { url: 'https://v3a.karofilm.ru/movie-schedule?city_id=1&movie_id=16701&schema=flat', city: 'Moscow', timezone: 'Europe/Moscow' },
  ru_moscow_cinemapark: { url: 'https://cinemapark.ru/', city: 'Moscow', timezone: 'Europe/Moscow' },
  ru_moscow_kinomax: { url: 'https://kinomax.ru/prazhskaya', city: 'Moscow', timezone: 'Europe/Moscow' },
  uk_kyiv_planetakino: { url: 'https://planetakino.ua/schedule/?cinema=cinema-1-uk', city: 'Kyiv', timezone: 'Europe/Kyiv' },
  en_london_odeon: { url: 'https://www.odeon.co.uk/cinemas/holloway/', city: 'London', timezone: 'Europe/London' },
  en_london_cineworld: { url: 'https://customerservice.cineworld.co.uk/cinemas/london-the-o2-greenwich/077', city: 'London', timezone: 'Europe/London' },
  pl_warsaw_multikino: { url: 'https://www.multikino.pl/repertuar/warszawa-zlote-tarasy/teraz-gramy', city: 'Warsaw', timezone: 'Europe/Warsaw' },
};
const source = sources[sourceId];
if (!source) throw new Error('unsupported_source_id');
return { json: { source_id: sourceId, requested_url: source.url, city: source.city, venue_timezone: source.timezone, captured_at: new Date().toISOString() } };`,
    },
    position: [500, 300],
  },
  output: [{ source_id: 'ru_moscow_karo', requested_url: 'https://karofilm.ru/films/1', city: 'Moscow', venue_timezone: 'Europe/Moscow', captured_at: '2026-09-20T00:00:00.000Z' }],
});

const fetchResponse = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Fetch Official Response',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.requested_url }}'),
      authentication: 'none',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: {
        parameters: [
          { name: 'Accept', value: 'text/html,application/json;q=0.9,*/*;q=0.8' },
          { name: 'User-Agent', value: 'Mozilla/5.0 (compatible; GO-IRL-Kino001B-Manual-Capture/1.0)' },
        ],
      },
      options: {
        timeout: 30000,
        redirect: { redirect: { followRedirects: true, maxRedirects: 10 } },
        response: { response: { fullResponse: false, neverError: false, responseFormat: 'text', outputPropertyName: 'body' } },
      },
    },
    position: [800, 300],
  },
  output: [{ statusCode: 200, headers: { 'content-type': 'text/html' }, body: '<html></html>' }],
});

const sanitizeCapture = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Sanitize Capture',
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: `const meta = $('Resolve Official Source').item.json;
const body = typeof $json === 'string' ? $json : (typeof $json.body === 'string' ? $json.body : JSON.stringify($json.body ?? $json ?? null));
return { json: {
  source_id: meta.source_id,
  requested_url: meta.requested_url,
  final_url: meta.requested_url,
  city: meta.city,
  venue_timezone: meta.venue_timezone,
  captured_at: meta.captured_at,
  status_code: 200,
  content_type: 'text/html',
  bytes: Buffer.byteLength(body, 'utf8'),
  body,
} };`,
    },
    position: [1100, 300],
  },
  output: [{ source_id: 'ru_moscow_karo', requested_url: 'https://karofilm.ru/films/1', final_url: 'https://karofilm.ru/films/1', city: 'Moscow', venue_timezone: 'Europe/Moscow', captured_at: '2026-09-20T00:00:00.000Z', status_code: 200, content_type: 'text/html', bytes: 13, body: '<html></html>' }],
});

export default workflow('kino001b-manual-capture', 'Kino001B — MANUAL Official Response Capture')
  .add(manualInput)
  .to(resolveSource)
  .to(fetchResponse)
  .to(sanitizeCapture);
