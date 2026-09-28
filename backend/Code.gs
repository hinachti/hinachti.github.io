/**
 * The contact form's back end.
 *
 * Receives a message from the site (the app's "כתבו לנו" opens the same form),
 * checks it came from a person, files it in Firestore where only the owner can
 * read it, and emails the owner at once, so a phone with Gmail rings within
 * seconds.
 *
 * Deployed as a web app: execute as the owner, access for anyone. Nobody can
 * write to Firestore directly: the database rules refuse every client write,
 * and this script reaches it with the owner's own credentials.
 *
 * Script property FIREBASE_PROJECT holds the project id. The owner's address
 * is never written here: it is whoever the script runs as.
 */

var POW_BITS = 16;                         // must match site.js
var MIN_FILL_MS = 3000;                    // nobody reads and writes a message in under 3 s
var MAX_AGE_MS = 12 * 60 * 60 * 1000;      // a form left open for half a day is fine; older is a replay
var LIMITS = { name: 80, email: 120, subject: 120, body: 2000, device: 80, appVersion: 20 };
var KINDS = { question: 'שאלה', idea: 'הצעה', bug: 'תקלה', review: 'ביקורת' };
var PANEL_URL = 'https://hinachti.github.io/admin/';

// Daily ceilings, so that even a sustained flood stays far inside Google's
// free quotas and costs nothing: the project has no billing account, so the
// worst a flood can do is fill the day's allowance, never run up a bill.
var DAILY_MESSAGES = 200;   // Firestore's free tier allows 20,000 writes a day
var DAILY_MAILS = 60;       // a script may send 100 mails a day; the rest wait in the panel

function doPost(e) {
  try {
    var m = JSON.parse(e.postData.contents);
    var problem = check_(m);
    if (problem) return reply_({ ok: false, error: problem });
    if (!bump_('messages', DAILY_MESSAGES)) return reply_({ ok: false, error: 'busy' });
    file_(m);
    notify_(m);
    return reply_({ ok: true });
  } catch (err) {
    console.error(err && err.stack || err);
    return reply_({ ok: false, error: 'server' });
  }
}

// A plain GET answers that the service is up, and nothing else.
function doGet() {
  return reply_({ ok: true, service: 'hinachti-contact' });
}

function reply_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function check_(m) {
  if (!m || typeof m !== 'object') return 'shape';
  if (m.website) return 'trap';
  if (!KINDS[m.kind]) return 'kind';
  for (var k in LIMITS) {
    if (m[k] != null && String(m[k]).length > LIMITS[k]) return 'long';
  }
  var subject = String(m.subject || '').trim();
  var body = String(m.body || '').trim();
  if (subject.length < 2 || body.length < 5) return 'short';
  if (m.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(m.email))) return 'email';
  if ((body.match(/https?:\/\//gi) || []).length > 3) return 'links';

  var now = Date.now();
  var opened = Number(m.opened);
  if (!opened || now - opened < MIN_FILL_MS || now - opened > MAX_AGE_MS) return 'time';

  // the proof of work: the salt starts with the time the form was opened,
  // and its hash with the nonce must start with POW_BITS zero bits
  var salt = String(m.salt || '');
  if (salt.split('.')[0] !== String(opened)) return 'proof';
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + m.nonce, Utilities.Charset.UTF_8);
  if (zeroBits_(digest) < POW_BITS) return 'proof';

  var cache = CacheService.getScriptCache();
  var key = 'pow:' + salt + ':' + m.nonce;
  if (cache.get(key)) return 'replay';          // each proof is good once
  cache.put(key, '1', 21600);

  // many messages in a few minutes is a machine, not people writing
  var burst = Number(cache.get('burst') || 0);
  if (burst >= 30) return 'busy';
  cache.put('burst', String(burst + 1), 600);
  if (m.email) {
    var perAddress = 'addr:' + String(m.email).toLowerCase();
    var sent = Number(cache.get(perAddress) || 0);
    if (sent >= 5) return 'busy';
    cache.put(perAddress, String(sent + 1), 3600);
  }
  return null;
}

// Counts one more of something for today, under a lock so two requests at
// once cannot both slip past the ceiling. False once the ceiling is reached.
function bump_(name, limit) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var props = PropertiesService.getScriptProperties();
    var key = 'count:' + name + ':' + Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyyMMdd');
    var n = Number(props.getProperty(key) || 0);
    if (n >= limit) return false;
    props.setProperty(key, String(n + 1));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function zeroBits_(bytes) {
  var n = 0;
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] & 255;
    if (b === 0) { n += 8; continue; }
    for (var j = 7; j >= 0 && !((b >> j) & 1); j--) n++;
    break;
  }
  return n;
}

function file_(m) {
  var project = PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT');
  if (!project) throw new Error('FIREBASE_PROJECT is not set');
  var str = function (v) { return { stringValue: String(v || '').trim() }; };
  var stars = m.kind === 'review' ? Math.max(0, Math.min(5, Math.round(Number(m.stars) || 0))) : 0;
  var doc = {
    fields: {
      kind: str(m.kind),
      stars: { integerValue: String(stars) },
      name: str(m.name),
      email: str(m.email),
      subject: str(m.subject),
      body: str(m.body),
      device: str(m.kind === 'bug' ? m.device : ''),
      appVersion: str(m.kind === 'bug' || m.kind === 'review' ? m.appVersion : ''),
      source: str(m.source === 'app' ? 'app' : 'web'),
      createdAt: { timestampValue: new Date().toISOString() },
      read: { booleanValue: false },
      done: { booleanValue: false }
    }
  };
  var res = UrlFetchApp.fetch(
    'https://firestore.googleapis.com/v1/projects/' + project + '/databases/(default)/documents/messages',
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(doc),
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
        // bill the call to the Firebase project, not to the script's hidden one
        'x-goog-user-project': project
      },
      muteHttpExceptions: true
    }
  );
  if (res.getResponseCode() >= 300) {
    throw new Error('firestore ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 400));
  }
}

function notify_(m) {
  if (!bump_('mails', DAILY_MAILS)) return;   // past the day's ceiling: it is in the panel all the same
  var esc = function (s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var kind = KINDS[m.kind];
  var stars = m.kind === 'review' && m.stars ? ' ' + '★★★★★'.slice(0, m.stars) : '';
  var from = m.source === 'app' ? 'מהאפליקציה' : 'מהאתר';
  var who = [m.name, m.email].filter(function (x) { return x; }).join(' · ') || 'בלי שם ובלי מייל';
  var extra = (m.kind === 'bug' || m.kind === 'review') && (m.device || m.appVersion)
    ? '<p style="color:#6b6254;margin:0 0 12px">' + esc([m.device, m.appVersion && ('גרסה ' + m.appVersion)].filter(Boolean).join(' · ')) + '</p>'
    : '';
  var html =
    '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f1b14">' +
    '<p style="margin:0 0 6px;color:#b7822f;font-weight:bold">' + esc(kind + stars) + ' · ' + from + '</p>' +
    '<h2 style="margin:0 0 6px;font-size:19px">' + esc(m.subject) + '</h2>' +
    '<p style="color:#6b6254;margin:0 0 12px">' + esc(who) + '</p>' + extra +
    '<div style="white-space:pre-wrap;background:#f6f1e7;border-radius:10px;padding:14px 16px;margin:0 0 18px">' + esc(m.body) + '</div>' +
    '<a href="' + PANEL_URL + '" style="display:inline-block;background:#e0a94a;color:#171208;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:10px">לפאנל הפניות</a>' +
    (m.email ? '<p style="color:#6b6254;font-size:13px;margin:16px 0 0">«השב» במייל הזה עונה ישירות לפונה.</p>' : '') +
    '</div>';
  var mail = {
    to: Session.getEffectiveUser().getEmail(),
    subject: 'הנחתי · ' + kind + stars + ': ' + String(m.subject).slice(0, 80),
    htmlBody: html,
    body: kind + stars + ' ' + from + '\n' + m.subject + '\n' + who + '\n\n' + m.body + '\n\n' + PANEL_URL,
    name: 'הנחתי · פניות'
  };
  if (m.email) mail.replyTo = String(m.email);
  MailApp.sendEmail(mail);
}

// Run once from the editor after deploying: files a test message and sends the
// mail, which proves the permissions, the project id and the database at once.
function selfTest() {
  var opened = Date.now() - 5000;
  var salt = opened + '.selftest' + Math.random().toString(16).slice(2, 6);
  var nonce = 0;
  while (zeroBits_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + nonce, Utilities.Charset.UTF_8)) < POW_BITS) nonce++;
  var m = { kind: 'question', subject: 'בדיקת מערכת', body: 'הודעת בדיקה מהסקריפט. אפשר למחוק.', name: 'בדיקה',
            email: '', source: 'web', opened: opened, salt: salt, nonce: nonce, website: '' };
  var problem = check_(m);
  if (problem) throw new Error('check failed: ' + problem);
  file_(m);
  notify_(m);
  console.log('ok: filed and mailed');
}
