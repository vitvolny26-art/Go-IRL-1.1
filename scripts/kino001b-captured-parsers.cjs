'use strict';

const REQUIRED = ['source_id', 'movie_title', 'movie_key', 'cinema_name', 'city', 'venue_timezone', 'local_date', 'local_time', 'starts_at', 'source_url'];

function decodeHtml(value) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(value) {
  return value.toLocaleLowerCase('uk-UA').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

function parsePlanetaKino(html, meta) {
  if (!html.includes('data-component-name="MovieWithSessionsCard"') || !html.includes('data-component-name="SessionItem"')) {
    throw new Error('fail_closed:no_schedule_cards');
  }
  if (/captcha|just a moment|attention required|sorry, you have been blocked/i.test(html)) {
    throw new Error('fail_closed:challenge');
  }
  const dateMatch = html.match(/Сьогодні[\s\S]{0,500}?([0-3]?\d)\s+вересня/i);
  if (!dateMatch) throw new Error('fail_closed:missing_local_date');
  const year = new Date(meta.captured_at).getUTCFullYear();
  const localDate = `${year}-09-${String(Number(dateMatch[1])).padStart(2, '0')}`;
  const cards = html.split('<div data-component-name="MovieWithSessionsCard"').slice(1);
  const screenings = [];
  const seen = new Set();
  for (const card of cards) {
    const linkRe = /<a href="(\/movie\/[^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
    let titleMatch;
    let title = '';
    let moviePath = '';
    while ((titleMatch = linkRe.exec(card))) {
      const candidate = decodeHtml(titleMatch[2]);
      if (candidate) {
        title = candidate;
        moviePath = titleMatch[1];
        break;
      }
    }
    if (!title) continue;
    const sessionRe = /id="([^"]+)-session-slide-item"[\s\S]{0,700}?<div class="time[^"]*"[^>]*>[\s\S]*?<span>\s*([0-2]\d:[0-5]\d)\s*<\/span>[\s\S]{0,300}?<div class="text-neutral-100[^"]*"[^>]*>\s*([^<]+?)\s*<\/div>/gi;
    let match;
    while ((match = sessionRe.exec(card))) {
      const sessionId = match[1];
      if (seen.has(sessionId)) continue;
      seen.add(sessionId);
      const localTime = match[2];
      const format = decodeHtml(match[3]);
      screenings.push({
        source_id: 'uk_kyiv_planetakino',
        movie_title: title,
        movie_key: `uk_kyiv_planetakino:${slug(title)}`,
        cinema_name: 'Планета Кіно — Блокбастер',
        city: 'Kyiv',
        venue_timezone: 'Europe/Kyiv',
        local_date: localDate,
        local_time: localTime,
        starts_at: `${localDate}T${localTime}:00+03:00`,
        source_url: meta.source_url,
        ticket_url: `https://planetakino.ua${moviePath}`,
        format,
        source_session_id: sessionId,
      });
    }
  }
  if (!screenings.length) throw new Error('fail_closed:no_valid_screenings');
  for (const item of screenings) {
    for (const field of REQUIRED) if (!item[field]) throw new Error(`fail_closed:missing_${field}`);
  }
  return screenings.sort((a, b) => a.source_session_id.localeCompare(b.source_session_id));
}

module.exports = { parsePlanetaKino, REQUIRED };
