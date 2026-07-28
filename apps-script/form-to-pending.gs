/* ================================================
   MHKFINDS — FORM → PENDING FORMATTER
   Every form submission also gets written as a deal-format
   row into a "Pending - Form" tab, so approving a deal is
   just copy-row → paste into Deals.

   The raw "Form Responses" tab stays (Google owns it — you
   can hide it with right-click → Hide sheet).

   REQUIRES a form question titled "What date does it happen"
   (a Section Header + Date item, optional, meant for one-time
   events — see the setup note Claude gave you in chat).

   HOW TO SET UP / UPDATE:
   1. Open the deals spreadsheet → Extensions → Apps Script
      (same project where the pending inbox + dashboard live)
   2. Open the "formToPending" file, select all, paste this
      whole file over it, Save
   3. Only if this is the FIRST install: pick setupFormTrigger
      in the function dropdown and press Run (authorize if
      asked). If the trigger's already installed from before,
      saving is enough — the trigger calls the function by
      name, so it automatically picks up this new version.
   ================================================ */

const FORM_TAB = 'Pending - Form';
const FORM_HEADER = ['Icon', 'Deal', 'Business', 'Location', 'Details', 'Category',
  'Expires', 'Show On', 'Event Date', 'Featured', 'ID', 'Source', 'Contact', 'Notes', 'Check'];

// Run this ONCE to install the on-submit trigger
function setupFormTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // avoid stacking duplicate triggers if run twice
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onDealFormSubmit')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onDealFormSubmit').forSpreadsheet(ss).onFormSubmit().create();
  Logger.log('Trigger installed — new submissions will flow into "' + FORM_TAB + '"');
}

function onDealFormSubmit(e) {
  const answers = e.namedValues; // { 'Question title': ['answer'], ... }

  // find an answer even if a question title gets reworded slightly
  const get = prefix => {
    const key = Object.keys(answers).find(k =>
      k.toLowerCase().startsWith(prefix.toLowerCase()));
    return key ? String(answers[key].join(', ')).trim() : '';
  };

  const business = get('Business name');
  const deal     = get('Deal name');
  const details  = get('The details');
  const category = get('What kind of deal').toLowerCase();
  const address  = get('Street address');
  const contact  = get('Best email or phone') || get('Email Address');
  const nameRole = get('Your name & role');
  const extra    = get('Anything else');
  const eventDate = get('What date does it happen'); // one-time events only

  let expires = get('If limited-time');
  // One-time event, no separate expiry given → stays visible through its
  // own date and disappears the day after, same rule as everywhere else
  if (eventDate && !expires) expires = eventDate;

  // "Every weekday" / "Weekends" → the sheet's Weekday / Weekend tokens
  const showOn = get('If recurring')
    .split(',').map(s => s.trim()).filter(Boolean)
    .map(d => d === 'Every weekday' ? 'Weekday' : d === 'Weekends' ? 'Weekend' : d)
    .join(', ');

  const slug = s => String(s).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).slice(0, 4).join('-');
  const id = (slug(business) + '-' + slug(deal)).replace(/^-|-$/g, '');

  const notes = ['from: ' + (nameRole || 'form'), extra].filter(Boolean).join(' · ');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(FORM_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(FORM_TAB);
    sheet.getRange(1, 1, 1, FORM_HEADER.length).setValues([FORM_HEADER]);
  }

  // Is this already in production? (helpers live in the inbox script file)
  const check = productionStatus(getProductionIndex(), deal, business);

  sheet.appendRow([
    '',            // Icon — you pick during review
    deal,
    business,
    address,
    details,
    category,      // food / drinks / event / other
    expires,       // blank unless limited-time or a dated one-time event
    showOn,        // blank for one-time / limited-time submissions
    eventDate,     // blank unless the one-time-event date was filled in
    '',            // Featured
    id,
    'submitted',
    contact,
    notes,
    check,         // 🔴 dupe / 🟡 business exists / 🟢 new
  ]);
}