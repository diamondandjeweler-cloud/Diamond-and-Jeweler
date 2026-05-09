// ============================================================
// DNJ Outreach Engine v3 — Google Apps Script
// Closed-loop: reply detection → intent → call list / auto-reply
// Paste this entire file into: Google Sheet → Extensions → Apps Script
// Then run setupTriggers() once to activate automation.
// ============================================================

// ── SHEET NAMES ──────────────────────────────────────────────
const LEADS_SHEET     = 'Leads';
const TEMPLATES_SHEET = 'Templates';
const SETTINGS_SHEET  = 'Settings';
const CALL_LIST_SHEET = 'Call List';

const FROM_EMAIL = 'diamondandjeweler@gmail.com';
const FROM_NAME  = 'Diamond and Jeweler';

// ── LEAD COLUMN INDICES (1-based) ────────────────────────────
const COL = {
  EMAIL:       1,
  FIRST_NAME:  2,
  COMPANY:     3,
  TYPE:        4,  // 'hr' or 'university'
  STATUS:      5,
  EMAILS_SENT: 6,
  THREAD_ID:   7,
  LAST_SENT:   8,
  NEXT_SEND:   9,
  NOTES:       10
};

// ── CALL LIST COLUMN INDICES (1-based) ───────────────────────
const CCOL = {
  NAME:       1,
  COMPANY:    2,
  EMAIL:      3,
  PHONE:      4,
  REPLY_DATE: 5,
  INTENT:     6,
  STATUS:     7,
  NOTES:      8
};

const STATUS = {
  NEW:          'new',
  SENT1:        'sent1',
  SENT2:        'sent2',
  SENT3:        'sent3',
  REPLIED:      'replied',
  COLD:         'cold',
  UNSUBSCRIBED: 'unsubscribed'
};

// ── SETTINGS ─────────────────────────────────────────────────
function getSettings() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!sheet) return defaults_();
  const raw = {};
  sheet.getDataRange().getValues().forEach(row => { raw[row[0]] = row[1]; });
  return {
    dailyLimit:    parseInt(raw['Daily Limit']      || 99),
    paused:        String(raw['Paused']             || 'false').toLowerCase() === 'true',
    fromName:      raw['From Name']                 || 'Diamond and Jeweler',
    followUp1Days: parseInt(raw['Follow Up 1 Days'] || 4),
    followUp2Days: parseInt(raw['Follow Up 2 Days'] || 5),
    coldAfterDays: parseInt(raw['Cold After Days']  || 7)
  };
}
function defaults_() {
  return { dailyLimit: 99, paused: false, fromName: 'Diamond and Jeweler',
           followUp1Days: 4, followUp2Days: 5, coldAfterDays: 7 };
}

// ── TEMPLATES ─────────────────────────────────────────────────
function getTemplates() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TEMPLATES_SHEET);
  if (!sheet) throw new Error('Templates sheet not found. Create it first.');
  const raw = {};
  sheet.getDataRange().getValues().forEach(row => { raw[row[0]] = row[1]; });
  return {
    hr: {
      subject: raw['HR Subject']   || '(no subject)',
      email1:  raw['HR Email 1']   || '',
      email2:  raw['HR Email 2']   || '',
      email3:  raw['HR Email 3']   || ''
    },
    university: {
      subject: raw['University Subject'] || '(no subject)',
      email1:  raw['University Email 1'] || '',
      email2:  raw['University Email 2'] || '',
      email3:  raw['University Email 3'] || ''
    },
    autoReplyCall:        raw['Auto Reply Call']        || '',
    autoReplyEmail:       raw['Auto Reply Email']       || '',
    autoReplyUnsubscribe: raw['Auto Reply Unsubscribe'] || ''
  };
}

// ── MERGE TAGS ────────────────────────────────────────────────
function fillTemplate(body, firstName, company) {
  return body
    .replace(/\{\{firstName\}\}/gi, firstName || 'there')
    .replace(/\{\{company\}\}/gi,   company   || 'your company');
}

// ── COUNT TODAY'S SENDS ───────────────────────────────────────
function countTodaySends(sheet) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let count = 0;
  sheet.getDataRange().getValues().slice(1).forEach(row => {
    const d = row[COL.LAST_SENT - 1];
    if (d instanceof Date) {
      const sent = new Date(d); sent.setHours(0, 0, 0, 0);
      if (sent.getTime() === today.getTime()) count++;
    }
  });
  return count;
}

// ── MAIN: SEND OUTREACH ───────────────────────────────────────
// Apps Script free-tier max execution time is 6 minutes. We cap per-run
// sends to PER_RUN_MAX with short jitter so the loop completes well
// within the window. Pacing comes from the hourly trigger frequency.
//   Daily volume = PER_RUN_MAX × 24 (theoretical max = 120/day)
//   With Daily Limit = 85 and PER_RUN_MAX = 5: caps at 85/day, hit by
//   ~17 hourly runs (e.g. 9am-1am next day), then silent until reset.
const PER_RUN_MAX     = 5;        // max sends per single trigger execution
const PER_SEND_JITTER = 12000;    // ~12s ± random between sends (well under the 6-min ceiling)

function sendOutreach() {
  const settings = getSettings();
  if (settings.paused) { Logger.log('Paused — skipping.'); return; }

  const ss         = SpreadsheetApp.getActiveSpreadsheet();
  const leadsSheet = ss.getSheetByName(LEADS_SHEET);
  if (!leadsSheet) { Logger.log('Leads sheet not found.'); return; }

  const templates  = getTemplates();
  const now        = new Date();
  let todaySends   = countTodaySends(leadsSheet);
  let runSends     = 0;  // sends in THIS execution (separate from daily total)

  if (todaySends >= settings.dailyLimit) {
    Logger.log(`Daily limit reached (${todaySends}/${settings.dailyLimit}).`);
    return;
  }

  const data = leadsSheet.getDataRange().getValues();

  // Build a global suppression set: every email anywhere in the sheet that
  // already has status 'unsubscribed' (PDPA — never re-email these).
  const suppressed = new Set();
  for (let j = 1; j < data.length; j++) {
    const em = String(data[j][COL.EMAIL  - 1]).trim().toLowerCase();
    const st = String(data[j][COL.STATUS - 1]).trim().toLowerCase();
    if (em && st === STATUS.UNSUBSCRIBED) suppressed.add(em);
  }

  for (let i = 1; i < data.length; i++) {
    if (todaySends >= settings.dailyLimit) break;
    if (runSends   >= PER_RUN_MAX) {
      Logger.log(`Per-run cap reached (${runSends}/${PER_RUN_MAX}) — exiting; next trigger continues.`);
      break;
    }

    const row       = data[i];
    const email     = String(row[COL.EMAIL      - 1]).trim();
    const firstName = String(row[COL.FIRST_NAME - 1]).trim();
    const company   = String(row[COL.COMPANY    - 1]).trim();
    const type      = String(row[COL.TYPE       - 1]).trim().toLowerCase() || 'hr';
    const status    = String(row[COL.STATUS     - 1]).trim().toLowerCase() || STATUS.NEW;
    const threadId  = String(row[COL.THREAD_ID  - 1]).trim();
    const nextSend  =        row[COL.NEXT_SEND  - 1];

    // Skip terminal statuses
    if ([STATUS.REPLIED, STATUS.COLD, STATUS.SENT3, STATUS.UNSUBSCRIBED].includes(status)) continue;
    if (!email || !email.includes('@')) continue;
    // PDPA: never re-email an address that previously unsubscribed
    if (suppressed.has(email.toLowerCase())) {
      leadsSheet.getRange(i + 1, COL.STATUS).setValue(STATUS.UNSUBSCRIBED);
      leadsSheet.getRange(i + 1, COL.NOTES).setValue('Suppressed (previously unsubscribed)');
      Logger.log('Suppressed (prior unsubscribe) → ' + email);
      continue;
    }

    // Skip if not yet time for follow-up
    if (status !== STATUS.NEW && nextSend instanceof Date && nextSend > now) continue;

    // Select template set based on type
    const tmpl = (type === 'university') ? templates.university : templates.hr;

    // Determine step
    let bodyTemplate = '', newStatus = '', emailCount = 0, nextSendDays = 0, isReply = false;

    if (status === STATUS.NEW || status === '') {
      bodyTemplate = tmpl.email1; newStatus = STATUS.SENT1;
      emailCount = 1; nextSendDays = settings.followUp1Days; isReply = false;
    } else if (status === STATUS.SENT1) {
      bodyTemplate = tmpl.email2; newStatus = STATUS.SENT2;
      emailCount = 2; nextSendDays = settings.followUp2Days; isReply = true;
    } else if (status === STATUS.SENT2) {
      bodyTemplate = tmpl.email3; newStatus = STATUS.SENT3;
      emailCount = 3; nextSendDays = 0; isReply = true;
    } else {
      continue;
    }

    if (!bodyTemplate) { Logger.log(`No body for step ${emailCount} (${type}) — check Templates sheet.`); continue; }

    const body    = fillTemplate(bodyTemplate, firstName, company);
    // BUG FIX: subject must be merged too (was sending literal {{company}} in subject line)
    const subject = fillTemplate(tmpl.subject, firstName, company);

    try {
      let sentThreadId = threadId;

      if (isReply && threadId) {
        const thread = GmailApp.getThreadById(threadId);
        if (thread) {
          thread.reply(body, { name: FROM_NAME });
        } else {
          GmailApp.sendEmail(email, subject, body, { name: FROM_NAME });
          Utilities.sleep(3000);
          sentThreadId = getLastSentThreadId_(email, subject);
        }
      } else {
        GmailApp.sendEmail(email, subject, body, { name: FROM_NAME });
        Utilities.sleep(3000);
        sentThreadId = getLastSentThreadId_(email, subject);
      }

      const nextSendDate = new Date();
      if (nextSendDays > 0) nextSendDate.setDate(nextSendDate.getDate() + nextSendDays);

      const rowNum = i + 1;
      leadsSheet.getRange(rowNum, COL.STATUS      ).setValue(newStatus);
      leadsSheet.getRange(rowNum, COL.EMAILS_SENT ).setValue(emailCount);
      leadsSheet.getRange(rowNum, COL.THREAD_ID   ).setValue(sentThreadId || '');
      leadsSheet.getRange(rowNum, COL.LAST_SENT   ).setValue(now);
      if (nextSendDays > 0)
        leadsSheet.getRange(rowNum, COL.NEXT_SEND ).setValue(nextSendDate);

      todaySends++;
      runSends++;
      Logger.log(`[Step ${emailCount}][${type}] → ${email} (${newStatus}) — run ${runSends}/${PER_RUN_MAX}, day ${todaySends}/${settings.dailyLimit}`);

      // Short jitter only (8-16s) — total per-run sleep ~50s for 5 sends,
      // well under the 6-min Apps Script execution ceiling. Human-like
      // pacing across the day comes from the hourly trigger, not from
      // long sleeps inside one run.
      if (runSends < PER_RUN_MAX && todaySends < settings.dailyLimit) {
        Utilities.sleep(PER_SEND_JITTER + Math.floor(Math.random() * 4000));
      }

    } catch (e) {
      Logger.log(`Failed → ${email}: ${e.message}`);
      leadsSheet.getRange(i + 1, COL.NOTES).setValue('Error: ' + e.message);
    }
  }

  Logger.log(`Session complete. Sent today: ${todaySends}`);
}

// ── HELPER: FIND THREAD ID OF LAST SENT EMAIL ────────────────
function getLastSentThreadId_(toEmail, subject) {
  try {
    const threads = GmailApp.search(`in:sent to:${toEmail} subject:"${subject}"`, 0, 1);
    if (threads.length > 0) return threads[0].getId();
  } catch (e) {
    Logger.log('Thread lookup failed: ' + e.message);
  }
  return '';
}

// ── DETECT UNSUBSCRIBE INTENT ────────────────────────────────
// PDPA compliance: any reply that signals opt-out short-circuits the
// rest of the sequence. We check this BEFORE the phone-intent check
// because someone might reply "UNSUBSCRIBE — call me 0123456789" and
// the unsubscribe wins.
const UNSUB_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bopt\s*-?\s*out\b/i,
  /\bremove\s+me\b/i,
  /\btake\s+me\s+off\b/i,
  /\bstop\s+(emailing|contacting|sending)\b/i,
  /\bdo\s+not\s+(email|contact|message)\b/i,
  /\bnot\s+interested\b/i,
  /\bno\s+thanks?\b.{0,20}\b(remove|unsubscribe|stop)\b/is,
  /\bplease\s+remove\b/i,
];

function isUnsubscribeReply(body) {
  if (!body) return false;
  return UNSUB_PATTERNS.some(re => re.test(body));
}

// ── DETECT REPLY INTENT ───────────────────────────────────────
function detectIntent(body) {
  // 1. Unsubscribe wins over everything (PDPA-required)
  if (isUnsubscribeReply(body)) {
    return { type: 'unsubscribe', phone: '' };
  }
  // 2. Malaysian phone number → call intent
  const phoneRegex = /(?:\+?60|0)1[0-9][-\s]?\d{3,4}[-\s]?\d{3,4}/g;
  const matches = (body || '').match(phoneRegex);
  if (matches && matches.length > 0) {
    return { type: 'call', phone: matches[0].replace(/\s/g, '') };
  }
  // 3. Otherwise treat as email-reply intent
  return { type: 'email', phone: '' };
}

// ── ADD TO CALL LIST ──────────────────────────────────────────
function addToCallList(name, company, email, phone, intent, snippet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CALL_LIST_SHEET);
  if (!sheet) { setupCallList_(); sheet = ss.getSheetByName(CALL_LIST_SHEET); }
  sheet.appendRow([name, company, email, phone || '—', new Date(), intent, 'to call', '']);
  Logger.log('Call list updated: ' + name + ' | ' + phone);
}

// ── SEND AUTO-REPLY ───────────────────────────────────────────
function sendAutoReply(toEmail, firstName, company, threadId, intentType) {
  const templates = getTemplates();
  let bodyTemplate;
  if (intentType === 'call') {
    bodyTemplate = templates.autoReplyCall;
  } else if (intentType === 'unsubscribe') {
    bodyTemplate = templates.autoReplyUnsubscribe;
  } else {
    bodyTemplate = templates.autoReplyEmail;
  }
  if (!bodyTemplate) { Logger.log('Auto-reply template missing for: ' + intentType); return; }
  const body = fillTemplate(bodyTemplate, firstName, company);
  try {
    if (threadId) {
      const thread = GmailApp.getThreadById(threadId);
      if (thread) {
        thread.reply(body, { name: FROM_NAME });
        Logger.log('Auto-reply sent (in-thread) → ' + toEmail);
        return;
      }
    }
    GmailApp.sendEmail(toEmail, 'Re: Following up', body, { name: FROM_NAME });
    Logger.log('Auto-reply sent (new thread) → ' + toEmail);
  } catch (e) {
    Logger.log('Auto-reply failed → ' + toEmail + ': ' + e.message);
  }
}

// ── CHECK REPLIES ─────────────────────────────────────────────
function checkReplies() {
  const ss         = SpreadsheetApp.getActiveSpreadsheet();
  const leadsSheet = ss.getSheetByName(LEADS_SHEET);
  if (!leadsSheet) return;

  const myEmail = Session.getActiveUser().getEmail();
  const data    = leadsSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row      = data[i];
    const status   = String(row[COL.STATUS    - 1]).toLowerCase();
    const threadId = String(row[COL.THREAD_ID - 1]).trim();
    if (![STATUS.SENT1, STATUS.SENT2, STATUS.SENT3].includes(status)) continue;
    if (!threadId) continue;

    try {
      const thread   = GmailApp.getThreadById(threadId);
      if (!thread) continue;
      const messages = thread.getMessages();

      // Find the first reply (message NOT from us)
      const replyMsg = messages.find(msg => !msg.getFrom().includes(myEmail));
      if (!replyMsg) continue;

      const replyBody = replyMsg.getPlainBody();
      const intent    = detectIntent(replyBody);

      const email     = String(row[COL.EMAIL      - 1]).trim();
      const firstName = String(row[COL.FIRST_NAME - 1]).trim();
      const company   = String(row[COL.COMPANY    - 1]).trim();

      if (intent.type === 'unsubscribe') {
        // PDPA compliance — never email this address again.
        leadsSheet.getRange(i + 1, COL.STATUS).setValue(STATUS.UNSUBSCRIBED);
        sendAutoReply(email, firstName, company, threadId, 'unsubscribe');
        leadsSheet.getRange(i + 1, COL.NOTES).setValue(
          'UNSUBSCRIBED ' + new Date().toLocaleDateString() +
          ' | confirmation sent | suppressed permanently'
        );
        Logger.log('UNSUBSCRIBE → ' + email);
        continue;
      }

      // Mark as replied (call or generic-email intent)
      leadsSheet.getRange(i + 1, COL.STATUS).setValue(STATUS.REPLIED);

      if (intent.type === 'call') {
        addToCallList(firstName, company, email, intent.phone, 'call', replyBody.substring(0, 100));
        sendAutoReply(email, firstName, company, threadId, 'call');
        leadsSheet.getRange(i + 1, COL.NOTES).setValue('Replied — call | phone: ' + intent.phone + ' | ' + new Date().toLocaleDateString());
        Logger.log('Reply (call intent) → ' + email + ' | ' + intent.phone);
      } else {
        sendAutoReply(email, firstName, company, threadId, 'email');
        leadsSheet.getRange(i + 1, COL.NOTES).setValue('Replied — email | auto-replied | ' + new Date().toLocaleDateString());
        Logger.log('Reply (email intent) → ' + email);
      }

    } catch (e) {
      Logger.log(`Reply check error row ${i + 1}: ${e.message}`);
    }
  }
}

// ── MARK COLD (daily job) ─────────────────────────────────────
function markCold() {
  const settings   = getSettings();
  const ss         = SpreadsheetApp.getActiveSpreadsheet();
  const leadsSheet = ss.getSheetByName(LEADS_SHEET);
  if (!leadsSheet) return;

  const now           = new Date();
  const coldThreshold = settings.coldAfterDays * 24 * 60 * 60 * 1000;
  const data          = leadsSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const status   = String(data[i][COL.STATUS    - 1]).toLowerCase();
    const lastSent =        data[i][COL.LAST_SENT - 1];
    if (status !== STATUS.SENT3)          continue;
    if (!(lastSent instanceof Date))      continue;
    if (now - lastSent >= coldThreshold)
      leadsSheet.getRange(i + 1, COL.STATUS).setValue(STATUS.COLD);
  }
  Logger.log('Cold suppression complete.');
}

// ── SETUP TRIGGERS — run this ONCE manually ───────────────────
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('sendOutreach')
    .timeBased().everyHours(1).create();

  ScriptApp.newTrigger('checkReplies')
    .timeBased().everyMinutes(30).create();

  ScriptApp.newTrigger('markCold')
    .timeBased().everyDays(1).atHour(3).create();

  Logger.log('All triggers active. Engine is running.');
}

// ── PAUSE / RESUME ────────────────────────────────────────────
function pauseOutreach() {
  setSettingsValue_('Paused', 'true');
  Logger.log('Outreach paused.');
}
function resumeOutreach() {
  setSettingsValue_('Paused', 'false');
  Logger.log('Outreach resumed.');
}
function setSettingsValue_(key, value) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!sheet) return;
  const data  = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === key) { sheet.getRange(i + 1, 2).setValue(value); return; }
  }
}

// ── SETUP CALL LIST SHEET (private) ──────────────────────────
function setupCallList_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CALL_LIST_SHEET);
  if (!sheet) sheet = ss.insertSheet(CALL_LIST_SHEET);

  const headers = ['Name', 'Company', 'Email', 'Phone', 'Reply Date', 'Intent', 'Status', 'Discussion Notes'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Header styling
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Column widths
  sheet.setColumnWidth(CCOL.NAME,       120);
  sheet.setColumnWidth(CCOL.COMPANY,    150);
  sheet.setColumnWidth(CCOL.EMAIL,      200);
  sheet.setColumnWidth(CCOL.PHONE,      130);
  sheet.setColumnWidth(CCOL.REPLY_DATE, 110);
  sheet.setColumnWidth(CCOL.INTENT,      80);
  sheet.setColumnWidth(CCOL.STATUS,     100);
  sheet.setColumnWidth(CCOL.NOTES,      350);

  Logger.log('Call List sheet created.');
}

// ── ONE-CLICK PILOT BOOTSTRAP ────────────────────────────────
// Run this ONCE to apply safe-pilot Settings + verify triggers.
// Recommended for the first 7-14 days while you warm the sending domain.
//
// Settings applied:
//   Daily Limit       = 85       (15/day headroom under Gmail's 100/day quota
//                                 for follow-ups + auto-replies)
//   Paused            = false
//   Follow Up 1 Days  = 4
//   Follow Up 2 Days  = 5
//   Cold After Days   = 7
//   From Name         = Diamond and Jeweler
//
// Triggers ensured:
//   sendOutreach   — every hour
//   checkReplies   — every 30 min
//   markCold       — every day at 3am
function applyPilotSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS_SHEET);
    sheet.getRange(1, 1, 1, 2).setValues([['Setting', 'Value']]);
    sheet.getRange(1, 1, 1, 2).setBackground('#1a73e8').setFontColor('#fff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 250);
  }

  const target = {
    'Daily Limit':       85,         // Leaves ~15 emails/day headroom for follow-ups
                                     //   (Email 2/3 + auto-replies) under the 100/day
                                     //   free Gmail quota. Safe sustained operation.
    'Paused':            'false',
    'From Name':         'Diamond and Jeweler',
    'Follow Up 1 Days':  4,
    'Follow Up 2 Days':  5,
    'Cold After Days':   7,
  };

  const data = sheet.getDataRange().getValues();
  const existing = {};
  for (let i = 0; i < data.length; i++) {
    if (data[i][0]) existing[data[i][0]] = i + 1;
  }
  let updated = 0, appended = 0;
  Object.keys(target).forEach(key => {
    if (existing[key]) {
      sheet.getRange(existing[key], 2).setValue(target[key]);
      updated++;
    } else {
      sheet.appendRow([key, target[key]]);
      appended++;
    }
  });
  Logger.log(`Settings synced: ${updated} updated, ${appended} added.`);

  // Ensure triggers — clear all, then re-create the canonical trio
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendOutreach').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('checkReplies').timeBased().everyMinutes(30).create();
  ScriptApp.newTrigger('markCold').timeBased().everyDays(1).atHour(3).create();
  Logger.log('Triggers reset: sendOutreach (1h), checkReplies (30m), markCold (daily 3am).');

  ss.toast('Pilot settings applied. Daily limit: 85. Triggers active.', 'DNJ', 6);
}


// ── WRITE ALL EMAIL TEMPLATES (run once) ─────────────────────
// Writes the full set of 3-step sequences + auto-replies into the
// Templates sheet. Idempotent: existing keys are updated, missing keys
// are appended. Safe to re-run after editing copy here.
function writeAllTemplates_v2() {
  const HR_SUBJECT =
    'Best-fit hire for {{company}} — AI matched, free';

  const UNI_SUBJECT =
    'Best-fit roles for {{company}} students — AI picked, free';

  const HR_1 =
    "Hi {{firstName}},\n\n" +
    "I'm Kean, founder of Diamond and Jeweler (DNJ — diamondandjeweler.com).\n\n" +
    "We're a Malaysian AI recruitment platform. Three matches, zero noise.\n\n" +
    "Our matching engine runs on big-data signals across each candidate's " +
    "education, skills, work patterns, and stated career intent — then " +
    "surfaces exactly 3 matches per role, both ways. No 50-resume floods. " +
    "No keyword spam. Just three diamonds.\n\n" +
    "For {{company}}, here's the deal — fair on both sides:\n\n" +
    "  - You post one role. We send 3 AI-curated candidates within 14 days.\n" +
    "  - 100% FREE. No subscription, no card, no commitment.\n" +
    "  - Every talent in our pool is pre-vetted. We say \"every talent is " +
    "a diamond\" because we screen every grad before they enter.\n" +
    "  - You stay in control. Reject all 3 and walk away — we won't chase.\n\n" +
    "In return, our talents get the same: 3 curated companies that actually " +
    "fit them. No 200-job feed. No noise. Fair for both sides.\n\n" +
    "If {{company}} has even one open role for fresh grads, interns, or " +
    "junior hires, just reply with the role and I'll start the matching.\n\n" +
    "Best,\n" +
    "Kean — Founder, Diamond and Jeweler\n" +
    "diamondandjeweler@gmail.com  |  https://diamondandjeweler.com\n\n" +
    "──────────────────────────────────────────\n" +
    "PDPA: Your contact was collected from a publicly accessible page on " +
    "{{company}}'s website. Reply UNSUBSCRIBE to opt out — we'll remove " +
    "you within 24 hours and never contact again.\n" +
    "──────────────────────────────────────────";

  const HR_2 =
    "Hi {{firstName}},\n\n" +
    "Floating this back up.\n\n" +
    "Quick recap — DNJ matches {{company}} with 3 AI-curated candidates " +
    "per role, free. Every talent is a diamond (screened before entering " +
    "the pool). 14 days from your role description to your first 3 matches.\n\n" +
    "No signup, no card, no commitment. If you don't like the 3, walk away.\n\n" +
    "Worth one open role to try?\n\n" +
    "Best,\nKean";

  const HR_3 =
    "Hi {{firstName}},\n\n" +
    "Last note from me — won't keep cluttering your inbox.\n\n" +
    "If {{company}} ever wants to test 3 AI-matched diamonds for free, " +
    "just drop a line: diamondandjeweler@gmail.com\n\n" +
    "Wishing {{company}} a great hiring season.\n\n" +
    "Best,\nKean";

  const UNI_1 =
    "Hi {{firstName}},\n\n" +
    "I'm Kean, founder of Diamond and Jeweler (DNJ — diamondandjeweler.com).\n\n" +
    "We're a Malaysian AI recruitment platform. Three matches, zero noise.\n\n" +
    "Our matching engine runs on big-data signals — education, skills, " +
    "work patterns, career intent — and surfaces exactly 3 matches both " +
    "ways. No spam, no firehose. Just three diamonds.\n\n" +
    "For {{company}}'s career services / placement office, fair-both-sides " +
    "deal:\n\n" +
    "  - Refer your grad. We match them with 3 AI-curated employers in 14 days.\n" +
    "  - 100% FREE for {{company}} and the student. No fees, no subscription.\n" +
    "  - Every employer in our pool is verified — your grads aren't sent to " +
    "ghost listings or fake postings.\n" +
    "  - We treat every talent as a diamond. Screened, polished, presented " +
    "only to the 3 employers that fit them best.\n\n" +
    "In return, your students get genuine intros — not application black " +
    "holes. And your career-services team gets weekly placement updates.\n\n" +
    "Reply with a good time and I'll send a 15-min walkthrough, or just " +
    "say \"start the digest\" and I'll begin sending vacancies tailored " +
    "for your graduates.\n\n" +
    "Best,\n" +
    "Kean — Founder, Diamond and Jeweler\n" +
    "diamondandjeweler@gmail.com  |  https://diamondandjeweler.com\n\n" +
    "──────────────────────────────────────────\n" +
    "PDPA: Your contact was collected from a publicly accessible page on " +
    "{{company}}'s website. Reply UNSUBSCRIBE to opt out — we'll remove " +
    "you within 24 hours and never contact again.\n" +
    "──────────────────────────────────────────";

  const UNI_2 =
    "Hi {{firstName}},\n\n" +
    "Bumping this back up.\n\n" +
    "Quick recap: DNJ gives {{company}}'s grads 3 AI-matched employers " +
    "each, free, in 14 days. Every employer verified, every talent treated " +
    "as a diamond. No fees for the institution or the student.\n\n" +
    "Want me to start the weekly vacancy digest for {{company}}, or " +
    "schedule a quick walkthrough?\n\n" +
    "Best,\nKean";

  const UNI_3 =
    "Hi {{firstName}},\n\n" +
    "This will be my last note.\n\n" +
    "If {{company}}'s career office ever wants free, AI-matched job offers " +
    "for your grads, the door's always open: diamondandjeweler@gmail.com\n\n" +
    "Best of luck to your students this placement season.\n\n" +
    "Best,\nKean";

  const AUTO_CALL =
    "Hi {{firstName}},\n\n" +
    "Thank you so much for getting back and sharing your number! I'll give " +
    "you a call shortly to walk through how DNJ's AI matching works for " +
    "{{company}}.\n\n" +
    "Looking forward to speaking with you!\n\n" +
    "Best,\nKean — Diamond and Jeweler";

  const AUTO_EMAIL =
    "Hi {{firstName}},\n\n" +
    "Thanks so much for getting back — really appreciate it.\n\n" +
    "I'd love to set up a quick 10-min call to show you exactly how DNJ's " +
    "AI matching delivers 3 diamonds for {{company}}. What time works for " +
    "you this week?\n\n" +
    "You can also reach me directly at diamondandjeweler@gmail.com.\n\n" +
    "Looking forward!\n\n" +
    "Best,\nKean — Diamond and Jeweler";

  const AUTO_UNSUBSCRIBE =
    "Hi {{firstName}},\n\n" +
    "Got it — you've been removed from our list. You won't receive any " +
    "further messages from Diamond and Jeweler.\n\n" +
    "Apologies for the interruption, and best of luck to {{company}}.\n\n" +
    "Best,\nKean — Diamond and Jeweler";

  const entries = [
    ['HR Subject',         HR_SUBJECT],
    ['HR Email 1',         HR_1],
    ['HR Email 2',         HR_2],
    ['HR Email 3',         HR_3],
    ['University Subject', UNI_SUBJECT],
    ['University Email 1', UNI_1],
    ['University Email 2', UNI_2],
    ['University Email 3', UNI_3],
    ['Auto Reply Call',        AUTO_CALL],
    ['Auto Reply Email',       AUTO_EMAIL],
    ['Auto Reply Unsubscribe', AUTO_UNSUBSCRIBE],
  ];

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName(TEMPLATES_SHEET);
  if (!sheet) { sheet = ss.insertSheet(TEMPLATES_SHEET); }

  // Build a map of existing key → row number
  const existing = {};
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0]) existing[data[i][0]] = i + 1;
  }

  let updated = 0, appended = 0;
  entries.forEach(([key, value]) => {
    if (existing[key]) {
      sheet.getRange(existing[key], 2).setValue(value);
      updated++;
    } else {
      sheet.appendRow([key, value]);
      appended++;
    }
  });

  Logger.log(`writeAllTemplates_v2 done. updated=${updated} appended=${appended}`);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Templates synced — ${updated} updated, ${appended} added.`,
    'DNJ', 4
  );
}


// ── WRITE AUTO-REPLY TEMPLATES TO SHEET (run once) ───────────
function addAutoReplyTemplates() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TEMPLATES_SHEET);
  if (!sheet) { Logger.log('Templates sheet not found.'); return; }

  const callBody  =
    'Hi {{firstName}},\n\n' +
    'Thank you so much for getting back to me and sharing your number! ' +
    "I'll give you a call shortly to chat about how DNJ can help {{company}}.\n\n" +
    'Looking forward to speaking with you!\n\n' +
    'Best,\nKean\nDiamond and Jeweler';

  const emailBody =
    'Hi {{firstName}},\n\n' +
    'Thanks for getting back to us — really appreciate it!\n\n' +
    "I'd love to set up a quick 10-minute call to walk you through how DNJ works for {{company}}. " +
    'What time suits you best this week?\n\n' +
    'You can also reach me directly at diamondandjeweler@gmail.com.\n\n' +
    'Looking forward to connecting!\n\n' +
    'Best,\nKean\nDiamond and Jeweler';

  const data = sheet.getDataRange().getValues();

  let callRow = -1, emailRow = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === 'Auto Reply Call')  callRow  = i + 1;
    if (data[i][0] === 'Auto Reply Email') emailRow = i + 1;
  }

  if (callRow > 0) {
    sheet.getRange(callRow, 2).setValue(callBody);
    Logger.log('Updated Auto Reply Call at row ' + callRow);
  } else {
    sheet.appendRow(['Auto Reply Call', callBody]);
    Logger.log('Appended Auto Reply Call');
  }

  if (emailRow > 0) {
    sheet.getRange(emailRow, 2).setValue(emailBody);
    Logger.log('Updated Auto Reply Email at row ' + emailRow);
  } else {
    sheet.appendRow(['Auto Reply Email', emailBody]);
    Logger.log('Appended Auto Reply Email');
  }

  Logger.log('Auto-reply templates ready.');
}
