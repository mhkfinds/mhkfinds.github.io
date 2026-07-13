/* ================================================
   MHKFINDS - EVENTS SCRAPER
   Pulls upcoming events from Visit Manhattan and K-State UPC
   into scraper/pending-events.tsv for manual review.
   Rows you approve get copy-pasted into the Google Sheet;
   nothing is ever published automatically.

   Run: node scraper/scrape-events.js
   (no npm dependencies — needs Node 18+)
   ================================================ */

const fs = require('fs');
const path = require('path');

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT3QxDHqv4FuFfW2ygOAAPGco5WW-OJzAKYbdIQQ8lHguKr4e8yLnf7rNqHafiljTuW8h6-9-AWOCht/pub?gid=0&single=true&output=csv';
const UA = 'Mozilla/5.0 (compatible; mhkfinds-events; +https://mhkfinds.com)';
const DAYS_AHEAD = 45;
const OUT_FILE = path.join(__dirname, 'pending-events.tsv');

// ---------- date helpers (all output in Manhattan KS local time) ----------

function chicagoYMD(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d);
}

// Midnight in Chicago as a UTC instant (the Simpleview API requires this)
function chicagoMidnightUTC(d) {
  const ymd = chicagoYMD(d);
  for (const off of ['05', '06']) { // CDT / CST
    const cand = new Date(`${ymd}T${off}:00:00.000Z`);
    const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Chicago', hour: '2-digit', hourCycle: 'h23' }).format(cand);
    if (h === '00') return cand;
  }
  return new Date(`${ymd}T06:00:00.000Z`);
}

function chicagoTime(d) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true
  }).format(d).replace(':00', '').replace(/\s/g, '').toLowerCase(); // "7pm", "7:30pm"
}

function shortDate(ymd) {
  const [y, m, day] = ymd.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------- text helpers ----------

function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

function stripHtml(s) {
  return clean((s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' '));
}

function slugify(s, maxParts) {
  const parts = (s || '').toLowerCase()
    .replace(/¢/g, 'c')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(Boolean);
  return parts.slice(0, maxParts).join('-');
}

const ICONS = [
  [/trivia|quiz/i, '🧠'], [/music|concert|band|dj|singer|karaoke|sing/i, '🎵'],
  [/movie|film|cinema|screening/i, '🎬'], [/art|paint|craft|pottery|drawing/i, '🎨'],
  [/run|5k|marathon|race/i, '🏃'], [/soccer|football|basketball|baseball|sport|game day/i, '🏟️'],
  [/food|taste|dinner|lunch|brunch|bbq|pizza/i, '🍽️'], [/beer|brew|wine|cocktail/i, '🍺'],
  [/market|fair|festival|carnival|expo/i, '🎪'], [/museum|history|exhibit/i, '🏛️'],
  [/kid|family|story/i, '🧸'], [/yoga|fitness|workout|wellness/i, '💪'],
];
function pickIcon(title) {
  for (const [re, icon] of ICONS) if (re.test(title)) return icon;
  return '🎉';
}

// Time/date summary for the Details column
function detailsFor(startMs, endMs, extra) {
  const start = new Date(startMs), end = new Date(endMs || startMs);
  const sYmd = chicagoYMD(start), eYmd = chicagoYMD(end);
  let when;
  if (sYmd === eYmd) {
    const st = chicagoTime(start), et = chicagoTime(end);
    when = st === et ? st : `${st}-${et}`;
  } else {
    when = `${shortDate(sYmd)} - ${shortDate(eYmd)}`; // multi-day
  }
  const parts = [when];
  if (extra) parts.push(clean(extra));
  return parts.join(' · ').slice(0, 140);
}

// ---------- sources ----------

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

// K-State UPC — parse the public events page HTML. (Their robots.txt
// disallows the ?format=json shortcut, so we read the same page a
// visitor sees, which is allowed.)
async function scrapeUPC() {
  const html = await fetchText('https://www.kstateupc.com/our-events');
  const events = [];
  const articles = html.split('<article class="eventlist-event').slice(1);
  for (const block of articles) {
    if (!block.includes('eventlist-event--upcoming')) continue;

    const title = stripHtml((block.match(/class="eventlist-title-link">([\s\S]*?)<\/a>/) || [])[1]);
    const href = (block.match(/href="(\/our-events\/[^"]+)"/) || [])[1];
    if (!title || !href) continue;

    // Google Calendar export link carries exact UTC start/end times
    const gcal = block.match(/dates=(\d{8}T\d{6}Z)(?:\/|%2F)(\d{8}T\d{6}Z)/);
    const toIso = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
    let startMs, endMs;
    if (gcal) {
      startMs = Date.parse(toIso(gcal[1]));
      endMs = Date.parse(toIso(gcal[2]));
    } else {
      // fallback: the <time class="event-date"> attributes (dates only)
      const dates = [...block.matchAll(/class="event-date" datetime="(\d{4}-\d{2}-\d{2})"/g)].map(m => m[1]);
      if (!dates.length) continue;
      startMs = Date.parse(`${dates[0]}T12:00:00Z`);
      endMs = Date.parse(`${dates[dates.length - 1]}T12:00:00Z`);
    }

    const addrText = stripHtml(((block.match(/eventlist-meta-address[^>]*>([\s\S]*?)<a /) || [])[1] || ''));
    const venue = clean(addrText.split('|')[0]) || 'K-State Student Union';
    const mapQ = (block.match(/maps\.google\.com\?q=([^"]+)"/) || [])[1];
    const address = mapQ
      ? clean(decodeURIComponent(mapQ).replace(/,?\s*United States/, ''))
      : `${venue} Manhattan KS`;

    events.push({
      title,
      venue,
      address,
      details: detailsFor(startMs, endMs, ''),
      eventDate: chicagoYMD(new Date(startMs)),
      expires: chicagoYMD(new Date(endMs)),
      url: `https://www.kstateupc.com${href}`,
    });
  }
  return events;
}

// Visit Manhattan (Simpleview CMS REST API — the same endpoint their own
// events page calls in the browser; their robots.txt allows everything
// and asks for a 2s crawl delay, which we honor between requests)
async function scrapeVisitManhattan() {
  const page = await fetchText('https://www.visitmanhattanks.org/events/');
  const token = (page.match(/"token":"([a-f0-9]+)"/) || [])[1];
  if (!token) throw new Error('Could not find Simpleview API token on the events page');
  await new Promise(r => setTimeout(r, 2000)); // robots.txt Crawl-delay: 2

  const now = new Date();
  const until = new Date(now.getTime() + DAYS_AHEAD * 86400000);
  const query = {
    filter: {
      active: true,
      date_range: {
        start: { $date: chicagoMidnightUTC(now).toISOString() },
        end: { $date: chicagoMidnightUTC(until).toISOString() },
      },
    },
    options: {
      limit: 100, skip: 0, castDocs: false,
      fields: {
        _id: 1, title: 1, date: 1, startDate: 1, endDate: 1, location: 1,
        address1: 1, city: 1, url: 1, recurrence: 1, admission: 1,
      },
      sort: { date: 1 },
    },
  };
  const url = 'https://www.visitmanhattanks.org/includes/rest_v2/plugins_events_events_by_date/find/'
    + `?json=${encodeURIComponent(JSON.stringify(query))}&token=${token}`;
  const data = await fetchJSON(url);
  const docs = data.docs?.docs || data.docs || [];

  const events = [];
  const seen = new Set(); // recurring events appear once per occurrence — keep the first
  for (const e of docs) {
    const key = `${clean(e.title)}|${clean(e.location)}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const extra = [e.recurrence, e.admission].map(clean).filter(Boolean).join(' · ');
    // Simpleview gives no reliable time-of-day, only dates — so Details
    // is just the date span (multi-day only) plus recurrence/admission
    const sYmd = chicagoYMD(new Date(e.date));
    const eYmd = chicagoYMD(new Date(e.endDate || e.date));
    const span = sYmd === eYmd ? '' : `${shortDate(sYmd)} - ${shortDate(eYmd)}`;
    events.push({
      title: clean(e.title),
      venue: clean(e.location) || 'Manhattan KS',
      address: clean([e.address1, e.city || 'Manhattan', 'KS'].filter(Boolean).join(' ')),
      details: [span, extra].filter(Boolean).join(' · ').slice(0, 140),
      eventDate: chicagoYMD(new Date(e.date)),       // next occurrence
      expires: chicagoYMD(new Date(e.endDate || e.date)),
      url: e.url ? `https://www.visitmanhattanks.org${e.url}` : 'https://www.visitmanhattanks.org/events/',
    });
  }
  return events;
}

// ---------- dedupe against what's already in the live sheet ----------

function parseCSVRows(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

async function getExistingKeys() {
  const keys = new Set();
  try {
    const csv = await fetchText(SHEET_CSV_URL);
    for (const r of parseCSVRows(csv).slice(1)) {
      if (!r[1]) continue;
      keys.add(`${clean(r[1])}|${clean(r[2])}`.toLowerCase()); // deal|business
      if (r[10]) keys.add(clean(r[10]).toLowerCase());          // ID column
    }
  } catch (err) {
    console.warn('Could not fetch live sheet for dedupe:', err.message);
  }
  return keys;
}

// ---------- main ----------

async function main() {
  const [upc, vmk] = await Promise.all([
    scrapeUPC().catch(err => { console.warn('UPC scrape failed:', err.message); return []; }),
    scrapeVisitManhattan().catch(err => { console.warn('Visit Manhattan scrape failed:', err.message); return []; }),
  ]);
  console.log(`scraped: ${upc.length} from kstateupc.com, ${vmk.length} from visitmanhattanks.org`);

  const existing = await getExistingKeys();
  const usedIds = new Set();
  const rows = [];

  for (const ev of [...upc, ...vmk]) {
    if (existing.has(`${ev.title}|${ev.venue}`.toLowerCase())) continue; // already in the sheet

    let base = `${slugify(ev.venue, 3)}-${slugify(ev.title, 4)}`.replace(/^-|-$/g, '');
    let id = base, n = 2;
    while (usedIds.has(id)) id = `${base}-${n++}`;
    if (existing.has(id)) continue;
    usedIds.add(id);

    rows.push([
      pickIcon(ev.title),   // Icon
      ev.title,             // Deal
      ev.venue,             // Business
      ev.address,           // Location
      ev.details,           // Details
      'event',              // Category
      ev.expires,           // Expires (visible through this date)
      '',                   // Show On
      ev.eventDate,         // Event Date
      '',                   // Featured
      id,                   // ID
      'scraped',            // Source
      '',                   // Contact
      ev.url,               // Notes = where it came from
    ]);
  }

  rows.sort((a, b) => a[8].localeCompare(b[8])); // by Event Date

  const HEADER = ['Icon', 'Deal', 'Business', 'Location', 'Details', 'Category', 'Expires', 'Show On', 'Event Date', 'Featured', 'ID', 'Source', 'Contact', 'Notes'];
  fs.writeFileSync(OUT_FILE, [HEADER.join('\t'), ...rows.map(r => r.join('\t'))].join('\n') + '\n', 'utf8');
  console.log(`wrote ${rows.length} new candidate events to ${path.relative(process.cwd(), OUT_FILE)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
