// The owner's panel. Firebase Auth proves who is signed in (Google does the
// sign-in, this page never sees a password), and the database rules, not this
// code, decide that only the owner may read: anyone else who signs in gets a
// refusal from Google's servers. Messages arrive live, without a refresh.
//
// The config below is public by design: it names the project, it grants
// nothing. Empty on a local preview, where the panel shows invented examples.
const FIREBASE = {
  apiKey: 'AIzaSyCYvWbIBf4XCXCBYNqdV0S-cTxY2KzIrdw',
  authDomain: 'hinachti-contact.firebaseapp.com',
  projectId: 'hinachti-contact',
  appId: '1:573796670971:web:9ddc01f09d970d7435ff5e'
};
const SDK = 'https://www.gstatic.com/firebasejs/12.3.0/';

const names = { question: 'שאלה', idea: 'הצעה', bug: 'תקלה', review: 'ביקורת' };
const $ = (id) => document.getElementById(id);
const list = $('list');
let messages = [];
let filter = 'all';
const openIds = new Set();
let actions = { read() {}, done() {}, remove() {} };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = (d) => d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }) + ' · ' +
                    d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

function render() {
  const shown = messages.filter((m) => filter === 'all' || (filter === 'new' ? !m.read : m.kind === filter));
  list.innerHTML = shown.length ? '' : '<p class="empty">' + (messages.length ? 'אין פניות כאן.' : 'עוד לא הגיעו פניות.') + '</p>';
  for (const m of shown) {
    const el = document.createElement('details');
    el.className = 'msg' + (m.read ? '' : ' unread') + (m.done ? ' handled' : '');
    el.open = openIds.has(m.id);
    const reply = m.email
      ? '<a class="btn" href="mailto:' + esc(m.email) + '?subject=' + encodeURIComponent('בעניין: ' + m.subject) + '">השב במייל</a>'
      : '<span class="meta">לא הושאר מייל</span>';
    const device = (m.kind === 'bug' || m.kind === 'review') && (m.device || m.appVersion)
      ? '<p class="device-line">' + esc([m.device, m.appVersion && 'גרסה ' + m.appVersion].filter(Boolean).join(' · ')) + '</p>' : '';
    el.innerHTML =
      '<summary><span class="dot"></span><div class="head"><div class="subject">' + esc(m.subject) +
      ' <span class="done-label">· טופל</span></div><div class="meta"><span class="tag ' + esc(m.kind) + '">' + esc(names[m.kind]) + '</span>' +
      '<span class="tag src">' + (m.source === 'app' ? 'אפליקציה' : 'אתר') + '</span>' +
      (m.stars ? '<span class="stars-shown">' + '★★★★★'.slice(0, m.stars) + '</span>' : '') +
      '<span>' + esc(m.name || 'ללא שם') + '</span>' + (m.email ? '<bdi dir="ltr">' + esc(m.email) + '</bdi>' : '') +
      '</div></div><span class="when">' + when(m.at) + '</span></summary>' +
      '<div class="open"><p>' + esc(m.body) + '</p>' + device + '<div class="actions">' + reply +
      '<button class="btn-ghost" type="button" data-act="done">' + (m.done ? 'החזר לטיפול' : 'סמן כטופל') + '</button>' +
      '<button class="btn-ghost danger" type="button" data-act="delete">מחיקה</button></div></div>';
    el.addEventListener('toggle', () => {
      if (el.open) {
        openIds.add(m.id);
        if (!m.read) { m.read = true; el.classList.remove('unread'); counts(); actions.read(m); }
      } else {
        openIds.delete(m.id);
      }
    });
    el.querySelector('[data-act="done"]').addEventListener('click', () => { m.done = !m.done; actions.done(m); render(); });
    el.querySelector('[data-act="delete"]').addEventListener('click', () => {
      if (confirm('למחוק את הפנייה לצמיתות?')) { messages = messages.filter((x) => x !== m); actions.remove(m); render(); }
    });
    list.appendChild(el);
  }
  counts();
}

function counts() {
  const fresh = messages.filter((m) => !m.read).length;
  $('c-new').textContent = fresh;
  $('c-all').textContent = messages.length;
  $('c-done').textContent = messages.filter((m) => m.done).length;
  const rated = messages.filter((m) => m.stars);
  $('c-rating').textContent = rated.length ? (rated.reduce((a, m) => a + m.stars, 0) / rated.length).toFixed(1) + '★' : '–';
  // the tab says how many are waiting, so a glance at the browser is enough
  document.title = (fresh ? '(' + fresh + ') ' : '') + 'הנחתי · פניות';
}

for (const b of document.querySelectorAll('#filters button')) {
  b.addEventListener('click', () => {
    filter = b.dataset.f;
    for (const o of document.querySelectorAll('#filters button')) o.setAttribute('aria-pressed', String(o === b));
    render();
  });
}

const showPanel = (yes) => { $('panel').hidden = !yes; $('gate').hidden = yes; };

if (!FIREBASE.projectId) {
  // Local preview only: invented people, example.com addresses.
  $('sample-note').hidden = false;
  const t = (s) => new Date(s);
  messages = [
    { id: '1', kind: 'review', stars: 5, name: 'דוד ל.', email: 'david@example.com', subject: 'פשוט עובד', source: 'app',
      body: 'מניח כל בוקר כבר שלושה שבועות ברצף. התזכורת בדיוק בזמן, ואין שום דבר מיותר. תודה!', at: t('2026-09-28T07:42'), read: false, done: false },
    { id: '2', kind: 'bug', name: 'משה', email: 'moshe@example.com', subject: 'הזמנים בעיר שלי', source: 'app', device: 'Samsung SM-S911B', appVersion: '1.8.0',
      body: 'בחרתי את העיר שלי והשקיעה מופיעה דקה אחרי מה שכתוב בלוח של בית הכנסת. אולי כדאי לבדוק?', at: t('2026-09-27T21:10'), read: false, done: false },
    { id: '3', kind: 'idea', name: '', email: '', subject: 'קריאת שמע שעל המיטה', source: 'web',
      body: 'יהיה נהדר אם תוסיפו גם את קריאת שמע שעל המיטה, בנוסח ספרד.', at: t('2026-09-27T12:03'), read: true, done: false },
    { id: '4', kind: 'question', name: 'יוסי ב.', email: 'yossi@example.com', subject: 'האם יש גרסה לאייפון?', source: 'web',
      body: 'אשתי ביקשה לדעת אם יש תוכניות לאייפון.', at: t('2026-09-26T18:25'), read: true, done: true },
    { id: '5', kind: 'review', stars: 4, name: 'אבי', email: '', subject: 'יפה מאוד', source: 'web',
      body: 'אפליקציה מעולה. הייתי שמח לאפשרות לשנות את צליל התזכורת.', at: t('2026-09-25T08:15'), read: true, done: false }
  ];
  $('signout').addEventListener('click', (e) => { e.preventDefault(); showPanel(false); });
  $('signin').addEventListener('click', () => showPanel(true));
  showPanel(true);
  render();
} else {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')
  ]);
  const app = initializeApp(FIREBASE);
  const a = auth.getAuth(app);
  const db = fs.getFirestore(app);
  let stop = null;

  actions = {
    read: (m) => fs.updateDoc(fs.doc(db, 'messages', m.id), { read: true }).catch(console.error),
    done: (m) => fs.updateDoc(fs.doc(db, 'messages', m.id), { done: m.done }).catch(console.error),
    remove: (m) => fs.deleteDoc(fs.doc(db, 'messages', m.id)).catch(console.error)
  };

  $('signin').addEventListener('click', () => {
    $('gate-error').hidden = true;
    auth.signInWithPopup(a, new auth.GoogleAuthProvider()).catch((e) => {
      if (e.code !== 'auth/popup-closed-by-user') console.error(e);
    });
  });
  $('signout').addEventListener('click', (e) => { e.preventDefault(); auth.signOut(a); });

  auth.onAuthStateChanged(a, (user) => {
    if (stop) { stop(); stop = null; }
    if (!user) { showPanel(false); return; }
    $('who').textContent = user.displayName || 'מחובר';
    const q = fs.query(fs.collection(db, 'messages'), fs.orderBy('createdAt', 'desc'));
    stop = fs.onSnapshot(q, (snap) => {
      showPanel(true);
      $('load-error').hidden = true;
      messages = snap.docs.map((d) => {
        const v = d.data();
        return { id: d.id, ...v, at: v.createdAt ? v.createdAt.toDate() : new Date(), stars: Number(v.stars) || 0 };
      });
      render();
    }, (err) => {
      if (err.code === 'permission-denied') {
        // signed in, but not as the owner: the database said no
        showPanel(false);
        $('gate-error').hidden = false;
        auth.signOut(a);
      } else {
        console.error(err);
        showPanel(true);
        $('load-error').hidden = false;
      }
    });
  });
}
