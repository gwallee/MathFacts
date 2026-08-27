/**
 * Math Facts logger — Caleb and Ellie
 * Google Apps Script web app, bound to the results Spreadsheet.
 *
 *   doPost  <-  the quiz posts a finished session; we validate it, append a
 *               row, then push a notification to ntfy.
 *           <-  the dashboard posts {type:'settings'} to change a kid's
 *               range / problem count / timer.
 *   doGet   ->  the dashboard reads sessions + settings as JSON.
 *           ->  ?settings=1 returns just the settings (what the quiz asks for).
 *
 * IMPORTANT: this file lives in a PUBLIC GitHub repo, so the copy here
 * carries a placeholder topic. Put your real ntfy topic ONLY in the copy
 * inside the Apps Script editor. It never appears in the quiz or the
 * dashboard, which is the whole point of routing the push through here.
 */

// ============================== CONFIG ==============================
var CONFIG = {
  // Replace with your own unguessable topic inside the Apps Script editor.
  NTFY_TOPIC: 'PUT-YOUR-NTFY-TOPIC-HERE',
  NTFY_SERVER: 'https://ntfy.sh',
  NTFY_TITLE: 'Math facts',       // ASCII only - ntfy headers must be ASCII

  SESSIONS_SHEET: 'Sessions',
  SETTINGS_SHEET: 'Settings',

  // Optional. Leave '' and anyone with the /exec URL can change the kids'
  // settings from a copy of the dashboard. Set it to a short code and the
  // dashboard will ask for it once before saving. Because it is checked
  // HERE and not in the public page source, it is a real lock.
  PARENT_PIN: '',

  MAX_PROBLEMS: 500,              // sanity ceiling on problems per session
  DEFAULT_LIMIT: 400              // rows doGet returns when ?limit is absent
};

// Seeded into the Settings tab the first time this script runs. After that
// the Sheet is the source of truth and you edit on the dashboard, not here.
//
// Keep this list in step with STUDENTS in config.js. A kid who is in config.js
// but NOT here appears in the quiz picker and is then refused by doPost as an
// unknown student, which is a confusing way to fail.
// focus: '' means a mixed round. A number drills that table, e.g. 12 gives
// 12×3 … 12×12 shuffled, with the orientation flipped at random.
var DEFAULT_STUDENTS = [
  { key: 'caleb', name: 'Caleb', minFactor: 3, maxFactor: 12,
    problemsPerSession: 20, secondsPerProblem: 12, focus: '' },
  { key: 'ellie', name: 'Ellie', minFactor: 1, maxFactor: 10,
    problemsPerSession: 10, secondsPerProblem: 20, focus: '' },
  { key: 'daniel', name: 'Daniel', minFactor: 2, maxFactor: 12,
    problemsPerSession: 20, secondsPerProblem: 14, focus: '' }
];
// ====================================================================

var HEADERS = [
  'Timestamp',        // A - when the session finished (phone clock), ISO text
  'ReceivedAt',       // B - when this script stored it, ISO text
  'StudentKey',       // C - 'caleb' / 'ellie'
  'Student',          // D - display name at the time of the session
  'Score',            // E
  'Total',            // F
  'Accuracy',         // G - 0..1
  'ElapsedSeconds',   // H
  'AvgSecPerProblem', // I
  'MissedCount',      // J
  'Missed',           // K - JSON: [{a,b,correct,given,timeout}, ...]
  'Mode'              // L - '' for a mixed round, or the table drilled, e.g. 12
];

// Focus is appended rather than slotted in before UpdatedAt on purpose: adding
// a column at the end needs no data shuffling, so an existing Settings tab
// upgrades itself by writing one header cell.
var SETTINGS_HEADERS = [
  'Key', 'Name', 'MinFactor', 'MaxFactor', 'ProblemsPerSession',
  'SecondsPerProblem', 'UpdatedAt', 'Focus'
];

// Guard rails applied to whatever the dashboard sends.
var LIMITS = {
  factor: { min: 1, max: 20 },
  problems: { min: 5, max: 100 },
  seconds: { min: 3, max: 60 }
};


/* ------------------------------ doPost ------------------------------ */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({ ok: false, error: 'empty body' });
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return json_({ ok: false, error: 'body is not valid JSON' });
    }

    if (payload && payload.type === 'settings') return saveSettings_(payload);
    return saveSession_(payload);

  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}


function saveSession_(payload) {
  var settings = readSettings_();
  var check = validateSession_(payload, settings);
  if (!check.ok) return json_(check);
  var s = check.session;

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSessionsSheet_();

    // The phone retries anything it did not get a reply for, so a store that
    // succeeded here but whose response was lost arrives again. One session is
    // one (studentKey, timestamp), so treat a repeat as already done and let
    // the phone clear it from its queue.
    if (alreadyStored_(sheet, s)) {
      return json_({ ok: true, stored: true, duplicate: true, pushed: false });
    }

    sheet.appendRow([
      s.timestamp,
      new Date().toISOString(),
      s.studentKey,
      s.student,
      s.score,
      s.total,
      s.total ? s.score / s.total : 0,
      s.elapsedSeconds,
      s.total ? Math.round((s.elapsedSeconds / s.total) * 100) / 100 : 0,
      s.missed.length,
      JSON.stringify(s.missed),
      s.mode === '' ? '' : s.mode
    ]);
  } finally {
    lock.releaseLock();
  }

  // A failed push must not make the quiz think the session was lost, so the
  // row is already safely stored before we try to notify.
  var pushed = true;
  try {
    notify_(s);
  } catch (pushErr) {
    pushed = false;
  }

  return json_({ ok: true, stored: true, pushed: pushed });
}


function validateSession_(p, settings) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    return { ok: false, error: 'payload must be a JSON object' };
  }

  // Accept either the key ('ellie') or the display name ('Ellie').
  var raw = String(p.studentKey || p.student || '').trim().toLowerCase();
  if (!raw) return { ok: false, error: 'missing student' };

  var key = null;
  for (var k in settings) {
    if (!settings.hasOwnProperty(k)) continue;
    if (k === raw || String(settings[k].name).toLowerCase() === raw) { key = k; break; }
  }
  if (!key) return { ok: false, error: 'unknown student' };

  var total = Math.round(Number(p.total));
  var score = Math.round(Number(p.score));
  var elapsed = Number(p.elapsedSeconds);

  if (!isFinite(total) || total < 1 || total > CONFIG.MAX_PROBLEMS) {
    return { ok: false, error: 'bad total' };
  }
  if (!isFinite(score) || score < 0 || score > total) {
    return { ok: false, error: 'bad score' };
  }
  if (!isFinite(elapsed) || elapsed < 0 || elapsed > 86400) {
    return { ok: false, error: 'bad elapsedSeconds' };
  }

  var missed = [];
  if (Array.isArray(p.missed)) {
    missed = p.missed
      .slice(0, CONFIG.MAX_PROBLEMS)
      .map(cleanMiss_)
      .filter(function (m) { return m !== null; });
  }

  var ts = String(p.timestamp == null ? '' : p.timestamp);
  if (!ts || isNaN(new Date(ts).getTime())) ts = new Date().toISOString();

  return {
    ok: true,
    session: {
      timestamp: ts,
      studentKey: key,
      student: settings[key].name,
      score: score,
      total: total,
      elapsedSeconds: Math.round(elapsed * 10) / 10,
      missed: missed,
      mode: normalizeFocus_(p.mode)
    }
  };
}


/** Has this exact (studentKey, timestamp) already been appended? */
function alreadyStored_(sheet, s) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  // A retry always lands within a few rows of the original, so only the tail
  // is worth scanning.
  var startRow = Math.max(2, lastRow - 50);
  var values = sheet.getRange(startRow, 1, lastRow - startRow + 1, 3).getValues();

  for (var i = 0; i < values.length; i++) {
    if (cellToIso_(values[i][0]) === s.timestamp &&
        String(values[i][2] || '').toLowerCase() === s.studentKey) {
      return true;
    }
  }
  return false;
}


function cleanMiss_(m) {
  if (!m || typeof m !== 'object') return null;
  var a = Math.round(Number(m.a));
  var b = Math.round(Number(m.b));
  if (!isFinite(a) || !isFinite(b)) return null;
  var given = (m.given === null || m.given === undefined) ? '' : String(m.given).slice(0, 8);
  return { a: a, b: b, correct: a * b, given: given, timeout: !!m.timeout };
}


/* ----------------------------- settings ----------------------------- */

function saveSettings_(payload) {
  if (CONFIG.PARENT_PIN && String(payload.pin || '') !== String(CONFIG.PARENT_PIN)) {
    return json_({ ok: false, error: 'wrong PIN' });
  }
  if (!payload.students || typeof payload.students !== 'object') {
    return json_({ ok: false, error: 'missing students' });
  }

  var current = readSettings_();
  var keys = Object.keys(payload.students);
  if (!keys.length) return json_({ ok: false, error: 'no students supplied' });

  for (var i = 0; i < keys.length; i++) {
    var key = String(keys[i]).trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,20}$/.test(key)) {
      return json_({ ok: false, error: 'bad student key: ' + keys[i] });
    }

    var incoming = payload.students[keys[i]] || {};
    var base = current[key] || { key: key, name: key, minFactor: 2, maxFactor: 12,
                                 problemsPerSession: 20, secondsPerProblem: 10, focus: '' };

    var name = String(incoming.name == null ? base.name : incoming.name).trim().slice(0, 30);
    if (!name) return json_({ ok: false, error: 'name cannot be empty' });

    var minF = clampInt_(incoming.minFactor, base.minFactor, LIMITS.factor);
    var maxF = clampInt_(incoming.maxFactor, base.maxFactor, LIMITS.factor);
    if (minF > maxF) return json_({ ok: false, error: 'smallest number is above the largest for ' + name });

    current[key] = {
      key: key,
      name: name,
      minFactor: minF,
      maxFactor: maxF,
      problemsPerSession: clampInt_(incoming.problemsPerSession, base.problemsPerSession, LIMITS.problems),
      secondsPerProblem: clampInt_(incoming.secondsPerProblem, base.secondsPerProblem, LIMITS.seconds),
      focus: (incoming.focus === undefined) ? (base.focus || '') : normalizeFocus_(incoming.focus),
      updatedAt: new Date().toISOString()
    };
  }

  writeSettings_(current);
  return json_({ ok: true, saved: true, settings: readSettings_() });
}


/**
 * '' for a mixed round, otherwise the table being drilled as a number.
 * Anything unparseable becomes '' — a bad value should mean "mixed", never
 * a broken session.
 */
function normalizeFocus_(value) {
  if (value === null || value === undefined || value === '') return '';
  var n = Math.round(Number(value));
  if (!isFinite(n) || n < LIMITS.factor.min || n > LIMITS.factor.max) return '';
  return n;
}


function clampInt_(value, fallback, limit) {
  var n = Math.round(Number(value));
  if (!isFinite(n)) return fallback;
  return Math.max(limit.min, Math.min(limit.max, n));
}


function readSettings_() {
  var sh = getSettingsSheet_();
  var out = {};
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return out;

  var values = sh.getRange(2, 1, lastRow - 1, SETTINGS_HEADERS.length).getValues();
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var key = String(r[0] || '').trim().toLowerCase();
    if (!key) continue;
    out[key] = {
      key: key,
      name: String(r[1] || key),
      minFactor: Number(r[2]) || 1,
      maxFactor: Number(r[3]) || 12,
      problemsPerSession: Number(r[4]) || 20,
      secondsPerProblem: Number(r[5]) || 10,
      updatedAt: cellToIso_(r[6]),
      focus: normalizeFocus_(r[7])
    };
  }
  return out;
}


function writeSettings_(settingsObj) {
  var sh = getSettingsSheet_();
  var keys = Object.keys(settingsObj).sort();
  var rows = keys.map(function (k) {
    var s = settingsObj[k];
    return [s.key, s.name, s.minFactor, s.maxFactor,
            s.problemsPerSession, s.secondsPerProblem,
            s.updatedAt || new Date().toISOString(),
            (s.focus === '' || s.focus === undefined) ? '' : s.focus];
  });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, SETTINGS_HEADERS.length).clearContent();
    }
    if (rows.length) {
      sh.getRange(2, 1, rows.length, SETTINGS_HEADERS.length).setValues(rows);
    }
  } finally {
    lock.releaseLock();
  }
}


/* ------------------------------- ntfy ------------------------------- */

function notify_(s) {
  var body = 'Finished: ' + s.score + '/' + s.total + ' in ' + mmss_(s.elapsedSeconds) +
             (s.mode === '' ? '' : ' (' + s.mode + 'x table)');

  if (s.missed.length) {
    body += '\nMissed: ' + s.missed.map(function (m) {
      var said = m.timeout ? 'ran out of time'
               : (m.given === '' ? 'left blank' : 'said ' + m.given);
      return m.a + 'x' + m.b + '=' + m.correct + ' (' + said + ')';
    }).join(', ');
  } else {
    body += '\nNo misses.';
  }

  var pct = Math.round((100 * s.score) / s.total);
  var tags = pct === 100 ? 'tada' : (pct >= 80 ? 'white_check_mark' : 'warning');

  UrlFetchApp.fetch(CONFIG.NTFY_SERVER + '/' + encodeURIComponent(CONFIG.NTFY_TOPIC), {
    method: 'post',
    contentType: 'text/plain; charset=utf-8',
    payload: body,
    headers: {
      'Title': ascii_(CONFIG.NTFY_TITLE + ' - ' + s.student + ' ' + s.score + '/' + s.total),
      'Tags': tags,
      'Priority': pct < 80 ? '4' : '3'
    },
    muteHttpExceptions: true
  });
}


/* ------------------------------- doGet ------------------------------ */

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};

    if (params.ping) {
      return json_({ ok: true, pong: true, time: new Date().toISOString() });
    }

    // The quiz only needs settings, and asks for them on every open.
    if (params.settings) {
      return json_({ ok: true, settings: readSettings_() });
    }

    var limit = parseInt(params.limit, 10);
    if (!isFinite(limit) || limit < 1) limit = CONFIG.DEFAULT_LIMIT;
    limit = Math.min(limit, 5000);

    var sheet = getSessionsSheet_();
    var lastRow = sheet.getLastRow();
    var sessions = [];

    if (lastRow > 1) {
      var startRow = Math.max(2, lastRow - limit + 1);
      var values = sheet.getRange(startRow, 1, lastRow - startRow + 1, HEADERS.length).getValues();

      for (var i = 0; i < values.length; i++) {
        var r = values[i];
        if (!r[0] && !r[3]) continue;             // blank row

        var missed = [];
        try {
          if (r[10]) missed = JSON.parse(String(r[10]));
          if (!Array.isArray(missed)) missed = [];
        } catch (jsonErr) {
          missed = [];
        }

        sessions.push({
          timestamp: cellToIso_(r[0]),
          receivedAt: cellToIso_(r[1]),
          studentKey: String(r[2] || '').toLowerCase(),
          student: String(r[3] || ''),
          score: Number(r[4]) || 0,
          total: Number(r[5]) || 0,
          accuracy: Number(r[6]) || 0,
          elapsedSeconds: Number(r[7]) || 0,
          avgSecPerProblem: Number(r[8]) || 0,
          missedCount: Number(r[9]) || 0,
          missed: missed,
          mode: normalizeFocus_(r[11])
        });
      }
    }

    return json_({
      ok: true,
      count: sessions.length,
      sessions: sessions,
      settings: readSettings_(),
      pinRequired: !!CONFIG.PARENT_PIN,
      // Handed to the dashboard so it can link to the Sheet. Deliberately
      // served from here rather than written into config.js, which is public
      // on GitHub — this way the spreadsheet id is not in the repo. Opening
      // it still requires a Google account with access.
      spreadsheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl()
    });

  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}


/* ------------------------------ helpers ----------------------------- */

function getSessionsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SESSIONS_SHEET);
  if (!sh) sh = ss.insertSheet(CONFIG.SESSIONS_SHEET);

  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    // Keep the ISO timestamps as plain text so Sheets does not quietly
    // reformat them into locale date values on the way back out.
    sh.getRange('A:B').setNumberFormat('@');
    return sh;
  }

  migrateSessionsSheet_(sh);
  ensureHeaders_(sh, HEADERS);
  return sh;
}


/**
 * v1.0.0 wrote 10 columns with the display name in C and no StudentKey.
 * v1.1.0 writes 11 with the key in C. Without this, old rows would be read
 * one column out of step and come back as nonsense. Idempotent: it checks
 * the header and does nothing once the sheet is current.
 */
function migrateSessionsSheet_(sh) {
  var width = Math.max(sh.getLastColumn(), 1);
  var header = sh.getRange(1, 1, 1, width).getValues()[0];

  if (String(header[2]) === 'StudentKey') return;   // already migrated
  if (String(header[2]) !== 'Student') return;      // not a shape we know; leave it alone

  sh.insertColumnBefore(3);
  sh.getRange(1, 3).setValue('StudentKey');

  var lastRow = sh.getLastRow();
  if (lastRow > 1) {
    // The display name has shifted into D; derive the key from it.
    var names = sh.getRange(2, 4, lastRow - 1, 1).getValues();
    var keys = names.map(function (r) {
      return [String(r[0] == null ? '' : r[0]).trim().toLowerCase()];
    });
    sh.getRange(2, 3, keys.length, 1).setValues(keys);
  }

  sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
}


/**
 * Later versions add columns at the END of a tab, so upgrading an existing
 * sheet is just writing the header row — no data moves, and old rows simply
 * have the new cells blank. Safe to run every time.
 */
function ensureHeaders_(sh, headers) {
  var current = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(current[i]) !== headers[i]) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      return;
    }
  }
}


function getSettingsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SETTINGS_SHEET);
  if (!sh) sh = ss.insertSheet(CONFIG.SETTINGS_SHEET);

  if (sh.getLastRow() === 0) {
    sh.appendRow(SETTINGS_HEADERS);
    sh.getRange(1, 1, 1, SETTINGS_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('G:G').setNumberFormat('@');

    var now = new Date().toISOString();
    var seed = DEFAULT_STUDENTS.map(function (s) {
      return [s.key, s.name, s.minFactor, s.maxFactor,
              s.problemsPerSession, s.secondsPerProblem, now, s.focus || ''];
    });
    sh.getRange(2, 1, seed.length, SETTINGS_HEADERS.length).setValues(seed);
    return sh;
  }

  ensureHeaders_(sh, SETTINGS_HEADERS);
  ensureDefaultStudents_(sh);
  return sh;
}


/**
 * Add any DEFAULT_STUDENTS missing from an existing Settings tab, leaving
 * every row that is already there alone.
 *
 * Without this, seeding only happened when the tab was empty — so a kid added
 * to the script later never reached the Sheet, showed up in the quiz picker
 * anyway (that list comes from config.js), and then had every session refused
 * as an unknown student. That failure is nearly impossible to read from the
 * quiz screen, so it is worth preventing here.
 */
function ensureDefaultStudents_(sh) {
  var lastRow = sh.getLastRow();
  var existing = {};

  if (lastRow > 1) {
    var keys = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      var k = String(keys[i][0] == null ? '' : keys[i][0]).trim().toLowerCase();
      if (k) existing[k] = true;
    }
  }

  var missing = DEFAULT_STUDENTS.filter(function (s) { return !existing[s.key]; });
  if (!missing.length) return;

  var now = new Date().toISOString();
  var rows = missing.map(function (s) {
    return [s.key, s.name, s.minFactor, s.maxFactor,
            s.problemsPerSession, s.secondsPerProblem, now, s.focus || ''];
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, SETTINGS_HEADERS.length).setValues(rows);
}


function cellToIso_(v) {
  if (v instanceof Date) return v.toISOString();
  return String(v || '');
}

function mmss_(totalSeconds) {
  var t = Math.max(0, Math.round(Number(totalSeconds) || 0));
  var m = Math.floor(t / 60);
  var s = t % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function ascii_(str) {
  return String(str).replace(/[^\x20-\x7E]/g, '');
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/* ---------------------- run these by hand to test -------------------- */

/** Editor > pick testNotification > Run. Your phone should buzz. */
function testNotification() {
  notify_({
    student: 'Caleb',
    score: 18,
    total: 20,
    elapsedSeconds: 161,
    missed: [
      { a: 7, b: 8, correct: 56, given: '54', timeout: false },
      { a: 9, b: 6, correct: 54, given: '', timeout: true }
    ]
  });
}

/** Editor > pick testAppendRow > Run. Writes one fake session and pushes. */
function testAppendRow() {
  var fake = {
    postData: {
      contents: JSON.stringify({
        studentKey: 'caleb',
        timestamp: new Date().toISOString(),
        score: 18,
        total: 20,
        elapsedSeconds: 161,
        missed: [{ a: 7, b: 8, given: '54', timeout: false }]
      })
    }
  };
  Logger.log(doPost(fake).getContent());
}

/** Editor > pick showSettings > Run, then View > Logs. */
function showSettings() {
  Logger.log(JSON.stringify(readSettings_(), null, 2));
}
