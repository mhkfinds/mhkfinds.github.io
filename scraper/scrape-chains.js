/* ================================================
   MHKFINDS - CHAIN DEALS SCRAPER
   Watches eatdrinkdeals.com (open WordPress API, robots.txt
   allows crawling) for the current headline promo at national
   chains that have a Manhattan KS location, and delivers the
   candidates to the "Pending - Chains" tab for review.

   These are RADAR PINGS, not ready deals: national promos
   don't always reach every franchise — verify with the local
   store before listing.

   Run: node scraper/scrape-chains.js
   (no npm dependencies — needs Node 18+)
   ================================================ */

const fs = require('fs');
const path = require('path');

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT3QxDHqv4FuFfW2ygOAAPGco5WW-OJzAKYbdIQQ8lHguKr4e8yLnf7rNqHafiljTuW8h6-9-AWOCht/pub?gid=0&single=true&output=csv';
const UA = 'Mozilla/5.0 (compatible; mhkfinds-deals; +https://mhkfinds.com)';
const OUT_FILE = path.join(__dirname, 'pending-chains.tsv');
const MAX_AGE_DAYS = 45; // ignore articles not updated recently (dead promos)

// ---- chains with a Manhattan KS location — EDIT THIS LIST freely ----
const CHAINS = [
  "McDonald's", 'Sonic', 'Chick-fil-A', 'Taco Bell', "Wendy's", 'Burger King',
  "Arby's", 'Subway', "Jimmy John's", 'Panda Express', 'Chipotle', 'Qdoba',
  "Taco John's", 'Dairy Queen', "Domino's", 'Pizza Hut', "Papa John's",
  "Papa Murphy's", 'Little Caesars', 'Starbucks', 'Buffalo Wild Wings',
  'Wingstop', "Freddy's", 'IHOP', 'Cold Stone Creamery', 'Olive Garden',
  "Applebee's", 'Texas Roadhouse', "Raising Cane's", 'Five Guys', 'Goodcents',
  'Panera',
];

function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

function decodeEntities(s) {
  return String(s)
    .replace(/&#8217;|&#039;|&apos;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&#8211;|&#8212;/g, '-')
    .replace(/&amp;|&#038;/g, '&').replace(/&nbsp;/g, ' ');
}

function slugify(s, maxParts) {
  return String(s).toLowerCase().replace(/¢/g, 'c').replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(Boolean).slice(0, maxParts).join('-');
}

const ICONS = [
  [/wing/i, '🍗'], [/pizza/i, '🍕'], [/taco|burrito/i, '🌮'], [/burger|whopper/i, '🍔'],
  [/coffee|latte/i, '☕'], [/smoothie|shake|slush|drink/i, '🥤'], [/chicken|nugget|tender/i, '🐔'],
  [/sub|sandwich|melt/i, '🥪'], [/ice cream|custard|blizzard|sundae|cake/i, '🍦'],
  [/breakfast|pancake|slam/i, '🥞'], [/pasta|breadstick/i, '🍝'],
];
function pickIcon(text) {
  for (const [re, icon] of ICONS) if (re.test(text)) return icon;
  return '🍔';
}

// ---- fetch all recent posts from the WordPress API ----
async function fetchPosts() {
  const posts = [];
  for (let page = 1; page <= 5; page++) {
    const url = `https://www.eatdrinkdeals.com/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=link,title,modified`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) break; // WP returns 400 past the last page
    const batch = await res.json();
    posts.push(...batch);
    if (batch.length < 100) break;
  }
  return posts;
}

// ---- dedupe against the live sheet (same approach as the events scraper) ----
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
    const res = await fetch(SHEET_CSV_URL, { headers: { 'User-Agent': UA } });
    const csv = await res.text();
    for (const r of parseCSVRows(csv).slice(1)) {
      if (!r[1]) continue;
      keys.add(`${clean(r[1])}|${clean(r[2])}`.toLowerCase());
      if (r[10]) keys.add(clean(r[10]).toLowerCase());
    }
  } catch (err) {
    console.warn('Could not fetch live sheet for dedupe:', err.message);
  }
  return keys;
}

// ---- main ----
async function main() {
  const posts = await fetchPosts();
  console.log(`fetched ${posts.length} posts from eatdrinkdeals.com`);

  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const existing = await getExistingKeys();
  const rows = [];
  const seenChains = new Set();

  // posts come newest-modified first; keep the freshest article per chain
  for (const post of posts) {
    if (Date.parse(post.modified) < cutoff) continue;
    const title = decodeEntities(clean(post.title?.rendered));
    const haystack = norm(title) + '|' + norm(post.link);

    const chain = CHAINS.find(c => haystack.includes(norm(c)));
    if (!chain || seenChains.has(chain)) continue;
    seenChains.add(chain);

    // headline deal = the part after the colon ("Denny's Specials: $5.99..." )
    const colon = title.indexOf(':');
    const deal = clean(colon > -1 ? title.slice(colon + 1) : title);
    if (!deal) continue;

    if (existing.has(`${deal}|${chain}`.toLowerCase())) continue;
    const id = `${slugify(chain, 3)}-${slugify(deal, 4)}`.replace(/^-|-$/g, '');
    if (existing.has(id)) continue;

    rows.push([
      pickIcon(title),   // Icon
      deal,              // Deal (headline — reword during review)
      chain,             // Business
      '',                // Location — fill with the MHK address on approval
      'National promo — verify with the Manhattan location before listing',
      'food',            // Category
      '', '', '', '',    // Expires / Show On / Event Date / Featured
      id,                // ID
      'scraped',         // Source
      '',                // Contact
      post.link,         // Notes = article with the full details
    ]);
  }

  rows.sort((a, b) => a[2].localeCompare(b[2])); // by chain name

  const HEADER = ['Icon', 'Deal', 'Business', 'Location', 'Details', 'Category', 'Expires', 'Show On', 'Event Date', 'Featured', 'ID', 'Source', 'Contact', 'Notes'];
  fs.writeFileSync(OUT_FILE, [HEADER.join('\t'), ...rows.map(r => r.join('\t'))].join('\n') + '\n', 'utf8');
  console.log(`wrote ${rows.length} chain-deal candidates to ${path.relative(process.cwd(), OUT_FILE)}`);

  const inboxUrl = process.env.SHEETS_INBOX_URL;
  const inboxSecret = process.env.SHEETS_INBOX_SECRET;
  if (inboxUrl && inboxSecret) {
    const res = await fetch(inboxUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ secret: inboxSecret, tab: 'Pending - Chains', rows }),
    });
    const out = await res.json().catch(() => ({}));
    if (out.ok) console.log(`delivered ${out.rows} rows to the ${out.tab || 'Pending - Chains'} tab`);
    else console.warn(`inbox delivery failed (HTTP ${res.status}):`, JSON.stringify(out));
  } else {
    console.log('no inbox configured — TSV only');
  }
}

main().catch(err => { console.error(err); process.exit(1); });