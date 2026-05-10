// ============================================================
// DNJ Social Discovery Engine v1 — Google Apps Script
// Pipeline: search macros → handles queue → profile reader → influencers table → DM queue
// Paste this entire file into: Google Sheet → Extensions → Apps Script
// Then run setupSheet() once, set the API_SECRET via setApiSecret('...'),
// then deploy as Web App (Execute as: me, Access: Anyone with the link)
// ============================================================

// ── PLATFORM CONSTANTS ──────────────────────────────────────
const PLATFORMS = ['instagram', 'x', 'tiktok', 'rednote', 'facebook', 'threads', 'lemon8'];

// ── SHEET NAMES ─────────────────────────────────────────────
const SHEETS = {
  INFLUENCERS: 'Influencers',
  QUEUE:       'Discovery Queue',
  SETTINGS:    'Settings',
  TEMPLATES:   'Templates',
  SEND_LOG:    'Send Log'
};

// ── INFLUENCERS COLUMN INDICES (1-based) ────────────────────
const INF_COL = {
  PLATFORM:         1,
  HANDLE:           2,
  URL:              3,
  DISPLAY_NAME:     4,
  FOLLOWERS:        5,
  FOLLOWING:        6,
  POSTS:            7,
  BIO:              8,
  EMAIL:            9,
  NICHE:            10,
  LANGUAGE:         11,
  LOCATION:         12,
  LAST_POST_DATE:   13,
  STATUS:           14,
  DISCOVERY_DATE:   15,
  LAST_DM_SENT:     16,
  DM_TEMPLATE_USED: 17,
  DM_REPLY:         18,
  REPLY_DATE:       19,
  NOTES:            20
};

const INF_HEADERS = [
  'Platform','Handle','URL','Display Name','Followers','Following','Posts','Bio',
  'Email','Niche','Language','Location','Last Post Date','Status','Discovery Date',
  'Last DM Sent','DM Template Used','DM Reply','Reply Date','Notes'
];

// ── DISCOVERY QUEUE COLUMNS ─────────────────────────────────
const Q_COL = {
  PLATFORM: 1,
  HANDLE:   2,
  ADDED_AT: 3,
  SOURCE:   4,
  STATUS:   5
};

const Q_HEADERS = ['Platform','Handle','Added At','Source','Status'];

// ── STATUS VALUES ───────────────────────────────────────────
const STATUS = {
  // Influencers row
  DISCOVERED:   'discovered',  // profile read, never DM'd
  DM_SENT:      'dm_sent',     // first DM sent
  REPLIED:      'replied',     // they replied
  IGNORED:      'ignored',     // no reply after follow-ups, give up
  UNQUALIFIED:  'unqualified', // failed filter (followers, niche, etc.)
  // Queue row
  PENDING:      'pending',
  PROCESSED:    'processed',
  FAILED:       'failed'
};

// ── DEFAULT SETTINGS ────────────────────────────────────────
const DEFAULT_SETTINGS = {
  'Min Followers':                  1000,
  'Max Followers':                  500000,
  'Profile Read Min Delay Seconds': 30,
  'Profile Read Max Delay Seconds': 60,
  'Discovery Paused IG':            'false',
  'Discovery Paused X':             'false',
  'Discovery Paused TikTok':        'false',
  'Discovery Paused RedNote':       'false',
  'Discovery Paused Facebook':      'false',
  'Discovery Paused Threads':       'false',
  'Discovery Paused Lemon8':        'false',
  'Daily DM Limit IG':              50,
  'Daily DM Limit X':               100,
  'Daily DM Limit TikTok':          30,
  'Daily DM Limit RedNote':         20,
  'Daily DM Limit Facebook':        30,
  'Daily DM Limit Threads':         50,
  'Daily DM Limit Lemon8':          30,
  'From Account IG':                'kensondiamondandjeweler',
  'From Account X':                 '@DiamondnJeweler',
  'From Account TikTok':            'TBD',
  'From Account RedNote':           'TBD',
  'From Account Facebook':          'TBD',
  'From Account Threads':           'TBD',
  'From Account Lemon8':            'TBD'
};

// ============================================================
// ONE-TIME SETUP
// ============================================================

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEETS.INFLUENCERS, INF_HEADERS);
  ensureSheet_(ss, SHEETS.QUEUE,       Q_HEADERS);
  ensureSheet_(ss, SHEETS.SETTINGS,    ['Setting','Value']);
  ensureSheet_(ss, SHEETS.TEMPLATES,   ['Platform','Template ID','Subject','Body','Notes']);
  ensureSheet_(ss, SHEETS.SEND_LOG,    ['Timestamp','Platform','Handle','Template ID','Status','Notes']);

  // Seed default settings if missing
  const settingsSheet = ss.getSheetByName(SHEETS.SETTINGS);
  const existing = {};
  settingsSheet.getDataRange().getValues().forEach((row, i) => {
    if (i > 0 && row[0]) existing[row[0]] = row[1];
  });
  const toAdd = [];
  Object.keys(DEFAULT_SETTINGS).forEach(key => {
    if (!(key in existing)) toAdd.push([key, DEFAULT_SETTINGS[key]]);
  });
  if (toAdd.length) {
    settingsSheet.getRange(settingsSheet.getLastRow() + 1, 1, toAdd.length, 2).setValues(toAdd);
  }

  Logger.log('Sheet setup complete. Tabs: ' + Object.values(SHEETS).join(', '));
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
  return sheet;
}

// Call this once from the editor with your chosen secret.
// Example:  setApiSecret('a-long-random-string-only-you-know')
function setApiSecret(secret) {
  if (!secret || secret.length < 16) throw new Error('Secret must be at least 16 chars.');
  PropertiesService.getScriptProperties().setProperty('API_SECRET', secret);
  Logger.log('API_SECRET set. Length: ' + secret.length);
}

// ============================================================
// WEB APP ENTRY POINT
// ============================================================

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('API_SECRET');
    if (!expectedSecret) return jsonResponse_({ ok: false, error: 'API_SECRET not configured' });
    if (body.secret !== expectedSecret) return jsonResponse_({ ok: false, error: 'unauthorized' });

    let result;
    switch (body.action) {
      case 'append_influencer':    result = appendInfluencer_(body.payload); break;
      case 'add_handles_to_queue': result = addHandlesToQueue_(body.platform, body.handles, body.source); break;
      case 'get_discovery_queue':  result = getDiscoveryQueue_(body.platform, body.limit); break;
      case 'mark_processed':       result = markProcessed_(body.platform, body.handle, body.status); break;
      case 'get_dm_queue':         result = getDMQueue_(body.platform, body.limit); break;
      case 'log_dm_sent':          result = logDMSent_(body.platform, body.handle, body.templateId, body.notes); break;
      case 'mark_replied':         result = markReplied_(body.platform, body.handle, body.replySnippet); break;
      case 'get_settings':         result = getSettings_(); break;
      case 'get_template':         result = getTemplate_(body.platform, body.templateId); break;
      case 'ping':                 result = { pong: new Date().toISOString() }; break;
      default: return jsonResponse_({ ok: false, error: 'unknown action: ' + body.action });
    }
    return jsonResponse_({ ok: true, result: result });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  // Health check + basic browser-friendly response
  return jsonResponse_({ ok: true, service: 'DNJ Social Discovery Engine', version: 1 });
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// QUEUE OPS — search macros write here
// ============================================================

function addHandlesToQueue_(platform, handles, source) {
  if (!platform || !PLATFORMS.includes(String(platform).toLowerCase())) {
    throw new Error('platform missing or not in ' + PLATFORMS.join(','));
  }
  if (!Array.isArray(handles)) throw new Error('handles must be an array');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const queue = ss.getSheetByName(SHEETS.QUEUE);
    const inf   = ss.getSheetByName(SHEETS.INFLUENCERS);

    // Build set of handles already known (queue + influencers)
    const seen = new Set();
    queue.getDataRange().getValues().forEach((row, i) => {
      if (i === 0 || !row[0]) return;
      seen.add(normKey_(row[0], row[1]));
    });
    inf.getDataRange().getValues().forEach((row, i) => {
      if (i === 0 || !row[0]) return;
      seen.add(normKey_(row[0], row[1]));
    });

    const platformLower = String(platform).toLowerCase();
    const toAdd = [];
    handles.forEach(h => {
      const handle = normHandle_(h);
      if (!handle) return;
      const key = normKey_(platformLower, handle);
      if (seen.has(key)) return;
      seen.add(key);
      toAdd.push([platformLower, handle, new Date(), source || '', STATUS.PENDING]);
    });

    if (toAdd.length) {
      queue.getRange(queue.getLastRow() + 1, 1, toAdd.length, Q_HEADERS.length).setValues(toAdd);
    }
    return { added: toAdd.length, skipped: handles.length - toAdd.length, queueDepth: countPending_(queue) };
  } finally {
    lock.releaseLock();
  }
}

function countPending_(queue) {
  let n = 0;
  queue.getDataRange().getValues().forEach((row, i) => {
    if (i === 0) return;
    if (String(row[Q_COL.STATUS - 1] || '').toLowerCase() === STATUS.PENDING) n++;
  });
  return n;
}

function getDiscoveryQueue_(platform, limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const queue = ss.getSheetByName(SHEETS.QUEUE);
  const data = queue.getDataRange().getValues();
  const out = [];
  const lim = Number(limit) || 20;
  const platformLower = platform ? String(platform).toLowerCase() : null;

  for (let i = 1; i < data.length && out.length < lim; i++) {
    const status = String(data[i][Q_COL.STATUS - 1] || '').toLowerCase();
    if (status !== STATUS.PENDING) continue;
    const rowPlatform = String(data[i][Q_COL.PLATFORM - 1] || '').toLowerCase();
    if (platformLower && rowPlatform !== platformLower) continue;
    const handle = normHandle_(data[i][Q_COL.HANDLE - 1]);
    out.push({
      platform: rowPlatform,
      handle:   handle,
      url:      buildProfileUrl_(rowPlatform, handle),
      addedAt:  data[i][Q_COL.ADDED_AT - 1],
      source:   data[i][Q_COL.SOURCE - 1]
    });
  }
  return out;
}

function markProcessed_(platform, handle, status) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const queue = ss.getSheetByName(SHEETS.QUEUE);
  const data = queue.getDataRange().getValues();
  const platformLower = String(platform).toLowerCase();
  const handleLower = normHandle_(handle);

  for (let i = 1; i < data.length; i++) {
    const rowPlatform = String(data[i][Q_COL.PLATFORM - 1] || '').toLowerCase();
    const rowHandle = normHandle_(data[i][Q_COL.HANDLE - 1]);
    if (rowPlatform === platformLower && rowHandle === handleLower) {
      queue.getRange(i + 1, Q_COL.STATUS).setValue(status || STATUS.PROCESSED);
      return { updated: true, row: i + 1 };
    }
  }
  return { updated: false };
}

// ============================================================
// INFLUENCERS OPS — Claude in Chrome writes here after reading a profile
// ============================================================

function appendInfluencer_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.INFLUENCERS);
    const platform = String(payload.platform || '').toLowerCase();
    const handle = normHandle_(payload.handle);
    if (!platform || !handle) throw new Error('platform and handle required');
    if (!PLATFORMS.includes(platform)) throw new Error('platform not recognized: ' + platform);

    // Compute filter status — if outside follower range mark unqualified but still insert
    const settings = getSettings_();
    const minF = Number(settings['Min Followers']) || 0;
    const maxF = Number(settings['Max Followers']) || 999999999;
    const followers = Number(payload.followers) || 0;
    const qualified = followers >= minF && followers <= maxF;
    const newStatus = payload.status || (qualified ? STATUS.DISCOVERED : STATUS.UNQUALIFIED);

    // Dedupe — search platform+handle in existing rows
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const rowPlatform = String(data[i][INF_COL.PLATFORM - 1] || '').toLowerCase();
      const rowHandle = normHandle_(data[i][INF_COL.HANDLE - 1]);
      if (rowPlatform === platform && rowHandle === handle) {
        const rowNum = i + 1;
        // Refresh fields, never overwrite DM tracking
        if (payload.displayName)   sheet.getRange(rowNum, INF_COL.DISPLAY_NAME).setValue(payload.displayName);
        if (payload.followers)     sheet.getRange(rowNum, INF_COL.FOLLOWERS).setValue(payload.followers);
        if (payload.following)     sheet.getRange(rowNum, INF_COL.FOLLOWING).setValue(payload.following);
        if (payload.posts)         sheet.getRange(rowNum, INF_COL.POSTS).setValue(payload.posts);
        if (payload.bio)           sheet.getRange(rowNum, INF_COL.BIO).setValue(payload.bio);
        if (payload.email)         sheet.getRange(rowNum, INF_COL.EMAIL).setValue(payload.email);
        if (payload.niche)         sheet.getRange(rowNum, INF_COL.NICHE).setValue(payload.niche);
        if (payload.language)      sheet.getRange(rowNum, INF_COL.LANGUAGE).setValue(payload.language);
        if (payload.location)      sheet.getRange(rowNum, INF_COL.LOCATION).setValue(payload.location);
        if (payload.lastPostDate)  sheet.getRange(rowNum, INF_COL.LAST_POST_DATE).setValue(payload.lastPostDate);
        // Don't downgrade dm_sent/replied back to discovered
        const currentStatus = String(data[i][INF_COL.STATUS - 1] || '').toLowerCase();
        if (currentStatus === '' || currentStatus === STATUS.DISCOVERED || currentStatus === STATUS.UNQUALIFIED) {
          sheet.getRange(rowNum, INF_COL.STATUS).setValue(newStatus);
        }
        markProcessed_(platform, handle, STATUS.PROCESSED);
        return { action: 'updated', row: rowNum, status: newStatus };
      }
    }

    // New row
    const url = payload.url || buildProfileUrl_(platform, handle);
    const newRow = new Array(INF_HEADERS.length).fill('');
    newRow[INF_COL.PLATFORM - 1]       = platform;
    newRow[INF_COL.HANDLE - 1]         = handle;
    newRow[INF_COL.URL - 1]            = url;
    newRow[INF_COL.DISPLAY_NAME - 1]   = payload.displayName || '';
    newRow[INF_COL.FOLLOWERS - 1]      = payload.followers || '';
    newRow[INF_COL.FOLLOWING - 1]      = payload.following || '';
    newRow[INF_COL.POSTS - 1]          = payload.posts || '';
    newRow[INF_COL.BIO - 1]            = payload.bio || '';
    newRow[INF_COL.EMAIL - 1]          = payload.email || '';
    newRow[INF_COL.NICHE - 1]          = payload.niche || '';
    newRow[INF_COL.LANGUAGE - 1]       = payload.language || '';
    newRow[INF_COL.LOCATION - 1]       = payload.location || '';
    newRow[INF_COL.LAST_POST_DATE - 1] = payload.lastPostDate || '';
    newRow[INF_COL.STATUS - 1]         = newStatus;
    newRow[INF_COL.DISCOVERY_DATE - 1] = new Date();
    newRow[INF_COL.NOTES - 1]          = payload.notes || '';
    sheet.appendRow(newRow);

    markProcessed_(platform, handle, STATUS.PROCESSED);
    return { action: 'inserted', row: sheet.getLastRow(), status: newStatus };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// DM QUEUE — read by sender macros / scripts
// ============================================================

function getDMQueue_(platform, limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.INFLUENCERS);
  const log = ss.getSheetByName(SHEETS.SEND_LOG);
  const settings = getSettings_();
  const data = sheet.getDataRange().getValues();
  const out = [];
  const lim = Number(limit) || 20;
  const platformLower = platform ? String(platform).toLowerCase() : null;
  const minF = Number(settings['Min Followers']) || 0;
  const maxF = Number(settings['Max Followers']) || 999999999;

  // Daily limit gating
  const sentToday = countSentTodayByPlatform_(log);
  const dailyLimits = {
    instagram: Number(settings['Daily DM Limit IG']) || 50,
    x:         Number(settings['Daily DM Limit X']) || 100,
    tiktok:    Number(settings['Daily DM Limit TikTok']) || 30,
    rednote:   Number(settings['Daily DM Limit RedNote']) || 20,
    facebook:  Number(settings['Daily DM Limit Facebook']) || 30,
    threads:   Number(settings['Daily DM Limit Threads']) || 50,
    lemon8:    Number(settings['Daily DM Limit Lemon8']) || 30
  };
  const pausedFlags = {
    instagram: settings['Discovery Paused IG'] === 'true' || settings['Discovery Paused IG'] === true,
    x:         settings['Discovery Paused X'] === 'true' || settings['Discovery Paused X'] === true,
    tiktok:    settings['Discovery Paused TikTok'] === 'true' || settings['Discovery Paused TikTok'] === true,
    rednote:   settings['Discovery Paused RedNote'] === 'true' || settings['Discovery Paused RedNote'] === true,
    facebook:  settings['Discovery Paused Facebook'] === 'true' || settings['Discovery Paused Facebook'] === true,
    threads:   settings['Discovery Paused Threads'] === 'true' || settings['Discovery Paused Threads'] === true,
    lemon8:    settings['Discovery Paused Lemon8'] === 'true' || settings['Discovery Paused Lemon8'] === true
  };

  for (let i = 1; i < data.length && out.length < lim; i++) {
    const rowPlatform = String(data[i][INF_COL.PLATFORM - 1] || '').toLowerCase();
    if (platformLower && rowPlatform !== platformLower) continue;
    if (pausedFlags[rowPlatform]) continue;
    if ((sentToday[rowPlatform] || 0) >= (dailyLimits[rowPlatform] || 0)) continue;
    const status = String(data[i][INF_COL.STATUS - 1] || '').toLowerCase();
    if (status !== STATUS.DISCOVERED) continue;
    const followers = Number(data[i][INF_COL.FOLLOWERS - 1]) || 0;
    if (followers < minF || followers > maxF) continue;
    out.push({
      row:         i + 1,
      platform:    rowPlatform,
      handle:      normHandle_(data[i][INF_COL.HANDLE - 1]),
      url:         data[i][INF_COL.URL - 1],
      displayName: data[i][INF_COL.DISPLAY_NAME - 1],
      followers:   followers,
      bio:         data[i][INF_COL.BIO - 1],
      niche:       data[i][INF_COL.NICHE - 1],
      language:    data[i][INF_COL.LANGUAGE - 1]
    });
    sentToday[rowPlatform] = (sentToday[rowPlatform] || 0) + 1;  // pre-reserve quota
  }
  return out;
}

function countSentTodayByPlatform_(log) {
  const out = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  log.getDataRange().getValues().forEach((row, i) => {
    if (i === 0) return;
    const ts = row[0];
    if (!(ts instanceof Date)) return;
    if (ts < today) return;
    const platform = String(row[1] || '').toLowerCase();
    out[platform] = (out[platform] || 0) + 1;
  });
  return out;
}

function logDMSent_(platform, handle, templateId, notes) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const log = ss.getSheetByName(SHEETS.SEND_LOG);
    const platformLower = String(platform).toLowerCase();
    const handleLower = normHandle_(handle);
    log.appendRow([new Date(), platformLower, handleLower, templateId || '', 'sent', notes || '']);

    const inf = ss.getSheetByName(SHEETS.INFLUENCERS);
    const data = inf.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').toLowerCase() === platformLower &&
          normHandle_(data[i][1]) === handleLower) {
        inf.getRange(i + 1, INF_COL.LAST_DM_SENT).setValue(new Date());
        inf.getRange(i + 1, INF_COL.DM_TEMPLATE_USED).setValue(templateId || '');
        inf.getRange(i + 1, INF_COL.STATUS).setValue(STATUS.DM_SENT);
        return { logged: true, row: i + 1 };
      }
    }
    return { logged: true, row: null, warning: 'no matching influencer row' };
  } finally {
    lock.releaseLock();
  }
}

function markReplied_(platform, handle, replySnippet) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const inf = ss.getSheetByName(SHEETS.INFLUENCERS);
    const data = inf.getDataRange().getValues();
    const platformLower = String(platform).toLowerCase();
    const handleLower = normHandle_(handle);
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').toLowerCase() === platformLower &&
          normHandle_(data[i][1]) === handleLower) {
        inf.getRange(i + 1, INF_COL.DM_REPLY).setValue(replySnippet || '');
        inf.getRange(i + 1, INF_COL.REPLY_DATE).setValue(new Date());
        inf.getRange(i + 1, INF_COL.STATUS).setValue(STATUS.REPLIED);
        return { updated: true, row: i + 1 };
      }
    }
    return { updated: false };
  } finally {
    lock.releaseLock();
  }
}

function getTemplate_(platform, templateId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.TEMPLATES);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').toLowerCase() === String(platform).toLowerCase() &&
        String(data[i][1] || '') === String(templateId)) {
      return { platform: data[i][0], templateId: data[i][1], subject: data[i][2], body: data[i][3], notes: data[i][4] };
    }
  }
  return null;
}

function getSettings_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SETTINGS);
  if (!sheet) return Object.assign({}, DEFAULT_SETTINGS);
  const out = {};
  sheet.getDataRange().getValues().forEach((row, i) => {
    if (i > 0 && row[0]) out[row[0]] = row[1];
  });
  return out;
}

// ============================================================
// HELPERS
// ============================================================

function normHandle_(h) {
  return String(h || '').trim().replace(/^@/, '').toLowerCase();
}

function normKey_(platform, handle) {
  return String(platform || '').toLowerCase() + '|' + normHandle_(handle);
}

function buildProfileUrl_(platform, handle) {
  const h = normHandle_(handle);
  if (!h) return '';
  switch (String(platform).toLowerCase()) {
    case 'instagram': return 'https://www.instagram.com/' + h + '/';
    case 'x':         return 'https://x.com/' + h;
    case 'tiktok':    return 'https://www.tiktok.com/@' + h;
    case 'rednote':   return 'https://www.xiaohongshu.com/user/profile/' + h;
    case 'facebook':  return 'https://www.facebook.com/' + h;
    case 'threads':   return 'https://www.threads.net/@' + h;
    case 'lemon8':    return 'https://www.lemon8-app.com/@' + h;
    default:          return '';
  }
}

// ============================================================
// HOUSEKEEPING
// ============================================================

function dailyReport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const inf = ss.getSheetByName(SHEETS.INFLUENCERS);
  const queue = ss.getSheetByName(SHEETS.QUEUE);

  const counts = { discovered: 0, dm_sent: 0, replied: 0, ignored: 0, unqualified: 0, queued: 0 };
  const byPlatform = {};
  PLATFORMS.forEach(p => { byPlatform[p] = { discovered: 0, dm_sent: 0, replied: 0 }; });

  inf.getDataRange().getValues().forEach((row, i) => {
    if (i === 0) return;
    const status = String(row[INF_COL.STATUS - 1] || '').toLowerCase();
    const platform = String(row[INF_COL.PLATFORM - 1] || '').toLowerCase();
    if (counts[status] !== undefined) counts[status]++;
    if (byPlatform[platform] && byPlatform[platform][status] !== undefined) {
      byPlatform[platform][status]++;
    }
  });
  queue.getDataRange().getValues().forEach((row, i) => {
    if (i === 0) return;
    if (String(row[Q_COL.STATUS - 1] || '').toLowerCase() === STATUS.PENDING) counts.queued++;
  });

  Logger.log('Daily report — totals: ' + JSON.stringify(counts));
  Logger.log('Daily report — by platform: ' + JSON.stringify(byPlatform));
  return { totals: counts, byPlatform: byPlatform };
}

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyReport').timeBased().atHour(9).everyDays(1).create();
  Logger.log('Triggers set up: dailyReport at 9am.');
}
