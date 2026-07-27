/* ================================================
   MHKFINDS — DASHBOARD BUILDER
   Rebuilds a "Dashboard" tab with live stats about the
   deals sheet: totals, category counts, deals live per
   day of week, pipeline inbox counts, top businesses.

   Refreshes itself every time the spreadsheet is opened,
   plus an "MHKfinds → Refresh Dashboard" menu item.

   HOW TO SET UP (one time, ~1 minute):
   1. Spreadsheet → Extensions → Apps Script (same project
      as the inbox + form scripts)
   2. + next to Files → Script → name it "dashboard",
      paste this file in, Save
   3. Pick refreshDashboard in the function dropdown → Run
      (authorize if asked). Done — check the Dashboard tab.
   ================================================ */

const DASH_TAB = 'Dashboard';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('MHKfinds')
    .addItem('Refresh Dashboard', 'refreshDashboard')
    .addToUi();
  try { refreshDashboard(); } catch (err) {}
}

function refreshDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const prod = ss.getSheets().find(s => s.getSheetId() === 0);
  const data = prod.getDataRange().getValues().slice(1)
    .filter(r => String(r[1]).trim());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // same date handling as the website (dates stay visible THROUGH expiry)
  const parseDate = v => {
    if (v instanceof Date) { const d = new Date(v); d.setHours(0, 0, 0, 0); return d; }
    const s = String(v).trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) return new Date(+m[3] < 100 ? +m[3] + 2000 : +m[3], +m[1] - 1, +m[2]);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  };

  const active = data.filter(r => { const d = parseDate(r[6]); return !d || d >= today; });

  // categories (accepts both 'food' and legacy 'today')
  const catName = c => {
    c = String(c).trim().toLowerCase();
    if (c === 'food' || c === 'today') return 'Food';
    if (c === 'drinks') return 'Drinks';
    if (c === 'event') return 'Events';
    return 'Other';
  };
  const cats = { Food: 0, Drinks: 0, Events: 0, Other: 0 };
  active.forEach(r => cats[catName(r[5])]++);

  // deals live per day — mirrors the site's Show On logic exactly
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayCounts = DAY_NAMES.map((day, i) => {
    const isWeekend = i >= 5;
    return active.filter(r => {
      const so = String(r[7] || '').trim().toLowerCase();
      if (!so) return true; // blank Show On = live every day
      return so.split(',').map(t => t.trim()).some(t =>
        t === day.toLowerCase() ||
        (t === 'weekday' && !isWeekend) ||
        (t === 'weekend' && isWeekend));
    }).length;
  });

  // other stats
  const weekOut = new Date(today.getTime() + 7 * 86400000);
  const expiringSoon = active.filter(r => { const d = parseDate(r[6]); return d && d <= weekOut; }).length;

  const bizCounts = {};
  active.forEach(r => { const b = String(r[2]).trim(); if (b) bizCounts[b] = (bizCounts[b] || 0) + 1; });
  const topBiz = Object.entries(bizCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const fld = r => String(r[9] || '').trim().toLowerCase();
  const featured = active.filter(r => ['partner', 'yes', 'true', '1', 'featured'].includes(fld(r))).length;

  const srcCounts = {};
  active.forEach(r => {
    const s = String(r[11] || 'manual').trim().toLowerCase() || 'manual';
    srcCounts[s] = (srcCounts[s] || 0) + 1;
  });
  const srcLine = Object.entries(srcCounts).map(([k, v]) => `${v} ${k}`).join(' · ');

  const tabRows = name => { const sh = ss.getSheetByName(name); return sh ? Math.max(0, sh.getLastRow() - 1) : 0; };

  // ---- layout ----
  const maxDay = Math.max.apply(null, dayCounts.concat([1]));
  const bar = n => '█'.repeat(Math.max(n > 0 ? 1 : 0, Math.round(n / maxDay * 20)));

  const rows = [];
  const bold = []; // row numbers (1-based) to bold
  const push = (a, b, c, isBold) => {
    rows.push([a, b === undefined ? '' : b, c || '']);
    if (isBold) bold.push(rows.length);
  };

  push('MHKFINDS DASHBOARD', '', '', true);
  push('Updated ' + new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
  push('');
  push('TOTAL ACTIVE DEALS', active.length, '', true);
  push('   🍔 Food', cats.Food);
  push('   🍹 Drinks', cats.Drinks);
  push('   🎉 Events', cats.Events);
  push('   ✨ Other', cats.Other);
  push('');
  push('DEALS LIVE BY DAY', '', '(what a visitor sees each day)', true);
  DAY_NAMES.forEach((d, i) => push('   ' + d, dayCounts[i], bar(dayCounts[i])));
  push('');
  push('PIPELINE (waiting on you)', '', '', true);
  push('   Pending - Events', tabRows('Pending - Events'));
  push('   Pending - Chains', tabRows('Pending - Chains'));
  push('   Pending - Form', tabRows('Pending - Form'));
  push('');
  push('OTHER STATS', '', '', true);
  push('   Businesses listed', Object.keys(bizCounts).length);
  push('   Featured spots', featured);
  push('   Expiring in next 7 days', expiringSoon);
  push('   By source', '', srcLine);
  push('');
  push('TOP BUSINESSES', '', '(by active deals)', true);
  topBiz.forEach(([name, n]) => push('   ' + name, n));

  // ---- write ----
  let sheet = ss.getSheetByName(DASH_TAB);
  if (!sheet) sheet = ss.insertSheet(DASH_TAB);
  sheet.clear();
  sheet.setHiddenGridlines(true);
  sheet.getRange(1, 1, rows.length, 3).setValues(rows).setFontFamily('Roboto Mono');
  bold.forEach(rn => sheet.getRange(rn, 1, 1, 3).setFontWeight('bold'));
  sheet.getRange(1, 1).setFontSize(14);
  sheet.getRange(2, 1).setFontColor('#999999');
  sheet.setColumnWidth(1, 230);
  sheet.setColumnWidth(2, 60);
  sheet.setColumnWidth(3, 260);
}
