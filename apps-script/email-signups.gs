/* ================================================
   MHKFINDS — EMAIL SIGNUPS INBOX
   Receives email signups from the site's banner form and
   appends them to an "Email Signups" tab. No secret on this
   one on purpose — it's called directly from visitors'
   browsers, so anything embedded in the site's JS is visible
   to anyone who views page source anyway (a "secret" there
   would just be security theater). Worst case of abuse is a
   few junk rows to skim before the list is ever actually used
   for anything — same review-first philosophy as everything
   else in this project.

   FIRST-TIME SETUP:
   1. Open the deals spreadsheet → Extensions → Apps Script
      (same project as the inbox, form formatter, dashboard)
   2. + next to Files → Script → name it "emailSignups",
      paste this whole file in, Save
   3. Deploy → New deployment
        - type (gear icon): Web app
        - Execute as: Me
        - Who has access: Anyone
   4. Deploy, authorize if asked (Advanced → Go to project
      (unsafe) if you see the warning screen — same as before,
      it's just Google flagging your own unverified script)
   5. Copy the Web app URL (ends in /exec) and send it to
      Claude — it gets pasted into script.js in place of
      EMAIL_SIGNUP_URL.

   UPDATING (already deployed, e.g. the honeypot addition):
   1. Paste this file's contents over the existing "emailSignups"
      file, Save
   2. Deploy → Manage deployments → ✏️ (edit) → Version: New
      version → Deploy. Just saving is NOT enough for a Web app —
      unlike the form-formatter's trigger, this one needs an
      explicit new version before the live /exec URL picks up
      the change. The URL itself doesn't change.
   ================================================ */

const EMAIL_TAB = 'Email Signups';

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput('bad request');
  }

  // Honeypot — real visitors never fill this field (it's invisible on
  // the site), so a value here means an automated submission. This is
  // the real enforcement point: a bot could skip the site's JS entirely
  // and POST straight here, so the check has to live server-side too.
  // Pretend success without saving anything, so it isn't tipped off.
  if (body.website) {
    return ContentService.createTextOutput('ok');
  }

  const email = String(body.email || '').trim();
  // Basic sanity check, not a full validator — real cleanup happens
  // when the list is reviewed before ever being used
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return ContentService.createTextOutput('invalid email');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(EMAIL_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(EMAIL_TAB);
    sheet.getRange(1, 1, 1, 2).setValues([['Timestamp', 'Email']]);
  }

  sheet.appendRow([new Date(), email]);

  return ContentService.createTextOutput('ok');
}