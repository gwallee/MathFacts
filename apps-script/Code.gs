/**
 * Caleb - Math Facts logger
 * Google Apps Script web app, bound to the results Spreadsheet.
 *
 *   doPost  <-  the quiz page posts one finished session; we validate it,
 *               append a row, then push a notification to ntfy.
 *   doGet   ->  the parent dashboard reads sessions back as JSON.
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

  SHEET_NAME: 'Sessions',

  // Only accept sessions for this name. Set to '' to accept any name.
  EXPECTED_STUDENT: 'Caleb',

  MAX_PROBLEMS: 500,              // sanity ceiling on problems per session
  DEFAULT_LIMIT: 400              // rows doGet returns when ?limit is absent
};
// ====================================================================

var HEADERS = [
  'Timestamp',        // A - when the session finished (phone clock), ISO text
  'ReceivedAt',       // B - when this script stored it, ISO text
  'Student',          // C
  'Score',            // D
  'Total',            // E
  'Accuracy',         // F - 0..1
  'ElapsedSeconds',   // G
  'AvgSecPerProblem', // H
  'MissedCount',      // I
  'Missed'            // J - JSON: [{a,b,correct,given,timeout}, ...]
];


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

    var check = validate_(payload);
    if (!check.ok) return json_(check);
    var s = check.session;

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      getSheet_().appendRow([
        s.timestamp,
        new Date().toISOString(),
        s.student,
        s.score,
        s.total,
        s.total ? s.score / s.total : 0,
        s.elapsedSeconds,
        s.total ? Math.round((s.elapsedSeconds / s.total) * 100) / 100 : 0,
        s.missed.length,
        JSON.stringify(s.missed)
      ]);
    } finally {
      lock.releaseLock();
    }

    // A failed push must not make the quiz think the session was lost,
    // so the row is already safely stored before we try to notify.
    var pushed = true;
    try {
      notify_(s);
    } catch (pushErr) {
      pushed = false;
    }

    return json_({ ok: true, stored: true, pushed: pushed });

  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}


function validate_(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    return { ok: false, error: 'payload must be a JSON object' };
  }

  var student = String(p.student == null ? '' : p.student).trim().slice(0, 40);
  if (!student) return { ok: false, error: 'missing student' };
  if (CONFIG.EXPECTED_STUDENT &&
      student.toLowerCase() !== CONFIG.EXPECTED_STUDENT.toLowerCase()) {
    return { ok: false, error: 'unknown student' };
  }

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
      student: student,
      score: score,
      total: total,
      elapsedSeconds: Math.round(elapsed * 10) / 10,
      missed: missed
    }
  };
}


function cleanMiss_(m) {
  if (!m || typeof m !== 'object') return null;
  var a = Math.round(Number(m.a));
  var b = Math.round(Number(m.b));
  if (!isFinite(a) || !isFinite(b)) return null;
  var given = (m.given === null || m.given === undefined) ? '' : String(m.given).slice(0, 8);
  return { a: a, b: b, correct: a * b, given: given, timeout: !!m.timeout };
}


/* ------------------------------- ntfy ------------------------------- */

function notify_(s) {
  var body = 'Finished: ' + s.score + '/' + s.total + ' in ' + mmss_(s.elapsedSeconds);

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

    var limit = parseInt(params.limit, 10);
    if (!isFinite(limit) || limit < 1) limit = CONFIG.DEFAULT_LIMIT;
    limit = Math.min(limit, 5000);

    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    var sessions = [];

    if (lastRow > 1) {
      var startRow = Math.max(2, lastRow - limit + 1);
      var values = sheet.getRange(startRow, 1, lastRow - startRow + 1, HEADERS.length).getValues();

      for (var i = 0; i < values.length; i++) {
        var r = values[i];
        if (!r[0] && !r[2]) continue;             // blank row

        var missed = [];
        try {
          if (r[9]) missed = JSON.parse(String(r[9]));
          if (!Array.isArray(missed)) missed = [];
        } catch (jsonErr) {
          missed = [];
        }

        sessions.push({
          timestamp: cellToIso_(r[0]),
          receivedAt: cellToIso_(r[1]),
          student: String(r[2] || ''),
          score: Number(r[3]) || 0,
          total: Number(r[4]) || 0,
          accuracy: Number(r[5]) || 0,
          elapsedSeconds: Number(r[6]) || 0,
          avgSecPerProblem: Number(r[7]) || 0,
          missedCount: Number(r[8]) || 0,
          missed: missed
        });
      }
    }

    return json_({ ok: true, count: sessions.length, sessions: sessions });

  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}


/* ------------------------------ helpers ----------------------------- */

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_NAME);

  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    // Keep the ISO timestamps as plain text so Sheets does not quietly
    // reformat them into locale date values on the way back out.
    sh.getRange('A:B').setNumberFormat('@');
  }
  return sh;
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
    student: CONFIG.EXPECTED_STUDENT || 'Caleb',
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
        student: CONFIG.EXPECTED_STUDENT || 'Caleb',
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
