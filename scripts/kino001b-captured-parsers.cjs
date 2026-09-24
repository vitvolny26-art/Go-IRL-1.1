'use strict';

const REQUIRED = ['source_id', 'movie_title', 'movie_key', 'cinema_name', 'city', 'venue_timezone', 'local_date', 'local_time', 'starts_at', 'source_url'];
const TIMEZONE = 'Europe/Kyiv';
const UKRAINIAN_MONTHS = {
  'січня': 1, 'лютого': 2, 'березня': 3, 'квітня': 4, 'травня': 5, 'червня': 6,
  'липня': 7, 'серпня': 8, 'вересня': 9, 'жовтня': 10, 'листопада': 11, 'грудня': 12,
};

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

function localDateInZone(iso, timeZone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error('fail_closed:invalid_captured_at');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function parseUkrainianDate(dayRaw, monthRaw, capturedAt, timeZone) {
  const day = Number(dayRaw);
  const month = UKRAINIAN_MONTHS[monthRaw.toLocaleLowerCase('uk-UA')];
  if (!day || day > 31 || !month) return null;
  const fetchedLocalDate = localDateInZone(capturedAt, timeZone);
  const currentYear = Number(fetchedLocalDate.slice(0, 4));
  const currentMonth = Number(fetchedLocalDate.slice(5, 7));
  const year = month < currentMonth - 6 ? currentYear + 1 : month > currentMonth + 6 ? currentYear - 1 : currentYear;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function zoneOffsetMs(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour), Number(value.minute), Number(value.second)) - instant.getTime();
}

function zonedLocalToIso(local, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00$/.exec(local);
  if (!match) throw new Error('fail_closed:invalid_local_datetime');
  const [, y, m, d, hh, mm] = match;
  const guess = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm));
  let offset = zoneOffsetMs(new Date(guess), timeZone);
  let utc = guess - offset;
  const corrected = zoneOffsetMs(new Date(utc), timeZone);
  if (corrected !== offset) {
    offset = corrected;
    utc = guess - offset;
  }
  return new Date(utc).toISOString();
}

function parsePlanetaKino(html, meta) {
  if (!html.includes('data-component-name="MovieWithSessionsCard"') || !html.includes('data-component-name="SessionItem"')) {
    throw new Error('fail_closed:no_schedule_cards');
  }
  if (/captcha|just a moment|attention required|sorry, you have been blocked/i.test(html)) {
    throw new Error('fail_closed:challenge');
  }
  const dateMatch = html.match(/Сьогодні[\s\S]{0,500}?([0-3]?\d)\s+([А-Яа-яІіЇїЄєҐґ]+)/i);
  const localDate = dateMatch ? parseUkrainianDate(dateMatch[1], dateMatch[2], meta.captured_at, TIMEZONE) : null;
  if (!localDate) throw new Error('fail_closed:missing_local_date');
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
        venue_timezone: TIMEZONE,
        local_date: localDate,
        local_time: localTime,
        starts_at: zonedLocalToIso(`${localDate}T${localTime}:00`, TIMEZONE),
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

module.exports = { parsePlanetaKino, parseUkrainianDate, zonedLocalToIso, REQUIRED };
