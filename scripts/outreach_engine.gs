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
    autoReplyCall:  raw['Auto Reply Call']  || '',
    autoReplyEmail: raw['Auto Reply Email'] || ''
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
function sendOutreach() {
  const settings = getSettings();
  if (settings.paused) { Logger.log('Paused — skipping.'); return; }

  const ss         = SpreadsheetApp.getActiveSpreadsheet();
  const leadsSheet = ss.getSheetByName(LEADS_SHEET);
  if (!leadsSheet) { Logger.log('Leads sheet not found.'); return; }

  const templates  = getTemplates();
  const now        = new Date();
  let todaySends   = countTodaySends(leadsSheet);

  if (todaySends >= settings.dailyLimit) {
    Logger.log(`Daily limit reached (${todaySends}/${settings.dailyLimit}).`);
    return;
  }

  const data = leadsSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (todaySends >= settings.dailyLimit) break;

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
    const subject = tmpl.subject;

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
      Logger.log(`[Step ${emailCount}][${type}] → ${email} (${newStatus})`);

      // Human-like random sleep: 2–5 minutes between sends
      if (todaySends < settings.dailyLimit) {
        Utilities.sleep((Math.random() * 3 + 2) * 60 * 1000);
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

// ── DETECT REPLY INTENT ───────────────────────────────────────
function detectIntent(body) {
  // Malaysian phone: +601x, 601x, 01x — with optional spaces/dashes
  const phoneRegex = /(?:\+?60|0)1[0-9][-\s]?\d{3,4}[-\s]?\d{3,4}/g;
  const matches = (body || '').match(phoneRegex);
  if (matches && matches.length > 0) {
    return { type: 'call', phone: matches[0].replace(/\s/g, '') };
  }
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
  const bodyTemplate = intentType === 'call' ? templates.autoReplyCall : templates.autoReplyEmail;
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

      // Mark as replied
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
