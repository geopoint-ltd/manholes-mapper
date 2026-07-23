/**
 * voice-depth-test.js — a self-contained proving ground for voice depth entry.
 *
 * Opens the browser Web Speech API, feeds every alternative through the pure
 * parseSpokenDepth() parser, and shows what was heard and what it parsed to, in
 * Hebrew / Arabic / English. This is a TEST surface, not the shipping feature:
 *   - it writes to no edge and no storage — Confirm just echoes the value;
 *   - it uses the browser Web Speech API, which on Android is ONLINE-ONLY
 *     (the real field feature will use an on-device recognizer — see the
 *     voice-depth decision docs). Use this on desktop or Android Chrome, online.
 *
 * Reachability: nothing is injected for normal users. A floating button appears
 * ONLY when the app is opened with ?voicetest=1 in the URL (the flag is then
 * remembered in localStorage so a reload keeps it; ?voicetest=0 clears it).
 *
 * Everything here is additive and touches no existing flow.
 */
import { pickBestParse, VOICE_LANGS, langFamily } from './number-parser.js';

const FLAG_KEY = 'voiceDepthTest';
const STYLE_ID = 'voice-depth-test-styles';

// Minimal three-language label table — a test surface needs ~8 words, not a locale.
const LABELS = {
  he: { title: 'בדיקת קול — עומק', hold: 'לחץ ודבר', starting: 'רגע…', listening: 'דבר עכשיו', heard: 'נשמע', parsed: 'זוהה', none: 'לא זוהה מספר', confirm: 'אישור', again: 'שוב', close: 'סגור', pick: 'בחר שפה', noApi: 'דפדפן זה לא תומך בזיהוי דיבור', denied: 'אין הרשאת מיקרופון', network: 'אין חיבור לרשת לזיהוי', nospeech: 'לא נשמע דיבור', wouldSet: 'יוגדר עומק', clipped: 'ייתכן שהמילה הראשונה נחתכה — המתן לסימון ואמור שוב' },
  ar: { title: 'اختبار الصوت — العمق', hold: 'اضغط وتكلم', starting: 'لحظة…', listening: 'تكلم الآن', heard: 'سُمع', parsed: 'مُحلّل', none: 'لم يُعرف رقم', confirm: 'تأكيد', again: 'مرة أخرى', close: 'إغلاق', pick: 'اختر اللغة', noApi: 'هذا المتصفح لا يدعم التعرف على الكلام', denied: 'لا إذن للميكروفون', network: 'لا اتصال بالشبكة للتعرف', nospeech: 'لم يُسمع كلام', wouldSet: 'سيُضبط العمق', clipped: 'ربما انقطعت الكلمة الأولى — انتظر الإشارة وقل مرة أخرى' },
  en: { title: 'Voice test — depth', hold: 'Hold & speak', starting: 'One sec…', listening: 'Speak now', heard: 'Heard', parsed: 'Parsed', none: 'No number recognized', confirm: 'Confirm', again: 'Again', close: 'Close', pick: 'Language', noApi: 'This browser has no speech recognition', denied: 'Microphone permission denied', network: 'No network for recognition', nospeech: 'No speech detected', wouldSet: 'Would set depth', clipped: 'First word may have been cut — wait for the cue, then say it again' },
};

const LANG_CHIPS = [
  { fam: 'he', label: 'עב' },
  { fam: 'ar', label: 'ع' },
  { fam: 'en', label: 'EN' },
];

let overlayEl = null;
let recog = null;
let listening = false;
let curFam = 'he';
let lastValue = null;

function SR() {
  return typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
}

function L() {
  return LABELS[curFam] || LABELS.en;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  .vdt-fab{position:fixed;inset-block-end:16px;inset-inline-start:16px;z-index:9998;
    display:flex;align-items:center;gap:8px;padding:10px 14px;border:none;border-radius:24px;
    background:#2FBE8E;color:#04120d;font:600 13px/1 system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.35);cursor:pointer}
  .vdt-fab .material-icons{font-size:20px}
  .vdt-overlay{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;
    background:rgba(6,12,14,.72);padding:16px}
  .vdt-overlay.open{display:flex}
  .vdt-card{width:min(420px,94vw);max-height:92vh;overflow:auto;background:#151d20;color:#e4ecea;
    border:1px solid #26343a;border-radius:14px;padding:18px;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .vdt-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-block-end:12px}
  .vdt-title{font-size:15px;font-weight:650}
  .vdt-x{background:none;border:none;color:#8fa3a6;cursor:pointer;font-size:22px;line-height:1;padding:4px}
  .vdt-langs{display:flex;gap:6px;margin-block-end:14px}
  .vdt-lang{flex:1;padding:8px 0;border:1px solid #33454c;border-radius:8px;background:#111a1c;
    color:#8fa3a6;font-size:14px;font-weight:600;cursor:pointer}
  .vdt-lang.on{border-color:#2FBE8E;color:#2FBE8E;background:#12312c}
  .vdt-mic{width:100%;min-height:64px;display:flex;align-items:center;justify-content:center;gap:10px;
    border:1px solid #33454c;border-radius:12px;background:#111a1c;color:#e4ecea;
    font-size:16px;font-weight:600;cursor:pointer;margin-block-end:14px;user-select:none;-webkit-user-select:none}
  .vdt-mic.live{border-color:#5FD3F0;color:#5FD3F0;background:#0e2730}
  .vdt-mic .material-icons{font-size:26px}
  .vdt-readout{background:#0d1416;border:1px solid #26343a;border-radius:10px;padding:12px 14px;margin-block-end:12px;min-height:96px}
  .vdt-row{display:flex;align-items:baseline;gap:8px;margin-block-end:8px}
  .vdt-k{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#7d9296;min-width:64px}
  .vdt-heard{font-size:14px;color:#cdd8d6;direction:ltr;unicode-bidi:plaintext}
  .vdt-value{font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:30px;font-weight:700;
    color:#E6EFEC;direction:ltr}
  .vdt-value.none{font-size:14px;color:#F2A33C;font-family:inherit;font-weight:600}
  .vdt-unit{font-size:15px;color:#8fa3a6}
  .vdt-cands{display:flex;flex-wrap:wrap;gap:6px;margin-block-start:6px}
  .vdt-cand{padding:4px 10px;border:1px solid #33454c;border-radius:14px;background:#111a1c;
    color:#cdd8d6;font-family:ui-monospace,Consolas,monospace;font-size:13px;cursor:pointer}
  .vdt-cand.sel{border-color:#2FBE8E;color:#2FBE8E}
  .vdt-actions{display:flex;gap:10px}
  .vdt-btn{flex:1;padding:12px 0;border-radius:10px;border:1px solid #33454c;background:#111a1c;
    color:#e4ecea;font-size:15px;font-weight:600;cursor:pointer}
  .vdt-btn.primary{border-color:#2FBE8E;background:#12312c;color:#2FBE8E}
  .vdt-btn:disabled{opacity:.45;cursor:default}
  .vdt-msg{min-height:18px;font-size:12.5px;color:#F2A33C;margin-block-start:10px;text-align:center}
  .vdt-ok{color:#2FBE8E}
  `;
  document.head.appendChild(s);
}

function icon(name) {
  return `<span class="material-icons" aria-hidden="true">${name}</span>`;
}

function build() {
  ensureStyles();
  overlayEl = document.createElement('div');
  overlayEl.className = 'vdt-overlay';
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('aria-modal', 'true');
  overlayEl.innerHTML = `
    <div class="vdt-card" dir="auto">
      <div class="vdt-head">
        <span class="vdt-title"></span>
        <button class="vdt-x" type="button" aria-label="close">${icon('close')}</button>
      </div>
      <div class="vdt-langs"></div>
      <button class="vdt-mic" type="button">${icon('mic')}<span class="vdt-mic-label"></span></button>
      <div class="vdt-readout">
        <div class="vdt-row"><span class="vdt-k vdt-k-heard"></span><span class="vdt-heard"></span></div>
        <div class="vdt-row"><span class="vdt-k vdt-k-parsed"></span><span class="vdt-value none"></span><span class="vdt-unit"></span></div>
        <div class="vdt-cands"></div>
      </div>
      <div class="vdt-actions">
        <button class="vdt-btn vdt-again" type="button"></button>
        <button class="vdt-btn primary vdt-confirm" type="button" disabled></button>
      </div>
      <div class="vdt-msg"></div>
    </div>`;
  document.body.appendChild(overlayEl);

  overlayEl.querySelector('.vdt-x').addEventListener('click', close);
  overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) close(); });
  overlayEl.querySelector('.vdt-mic').addEventListener('click', toggleListen);
  overlayEl.querySelector('.vdt-again').addEventListener('click', () => { resetReadout(); startListen(); });
  overlayEl.querySelector('.vdt-confirm').addEventListener('click', onConfirm);

  const langsEl = overlayEl.querySelector('.vdt-langs');
  LANG_CHIPS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'vdt-lang' + (c.fam === curFam ? ' on' : '');
    b.type = 'button';
    b.textContent = c.label;
    b.dataset.fam = c.fam;
    b.addEventListener('click', () => setFam(c.fam));
    langsEl.appendChild(b);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlayEl.classList.contains('open')) close();
  });
  applyLabels();
}

function applyLabels() {
  const l = L();
  const q = (s) => overlayEl.querySelector(s);
  q('.vdt-title').textContent = l.title;
  q('.vdt-mic-label').textContent = listening ? l.listening : l.hold;
  q('.vdt-k-heard').textContent = l.heard;
  q('.vdt-k-parsed').textContent = l.parsed;
  q('.vdt-again').textContent = l.again;
  q('.vdt-confirm').textContent = l.confirm;
  overlayEl.querySelectorAll('.vdt-lang').forEach((b) => b.classList.toggle('on', b.dataset.fam === curFam));
}

function setFam(fam) {
  curFam = fam;
  applyLabels();
  resetReadout();
}

function resetReadout() {
  lastValue = null;
  const q = (s) => overlayEl.querySelector(s);
  q('.vdt-heard').textContent = '';
  const v = q('.vdt-value');
  v.textContent = '';
  v.classList.add('none');
  q('.vdt-unit').textContent = '';
  q('.vdt-cands').innerHTML = '';
  q('.vdt-confirm').disabled = true;
  msg('');
}

function msg(text, ok) {
  const m = overlayEl.querySelector('.vdt-msg');
  m.textContent = text;
  m.classList.toggle('vdt-ok', !!ok);
}

/** Render one parse result into the readout. */
function render(result) {
  const l = L();
  const q = (s) => overlayEl.querySelector(s);
  q('.vdt-heard').textContent = result.raw || '';
  const v = q('.vdt-value');
  const unit = q('.vdt-unit');
  const cands = q('.vdt-cands');
  cands.innerHTML = '';

  if (!result.value) {
    v.textContent = l.none;
    v.classList.add('none');
    unit.textContent = '';
    lastValue = null;
    q('.vdt-confirm').disabled = true;
    return;
  }

  lastValue = result.value;
  v.textContent = result.value;
  v.classList.remove('none');
  unit.textContent = 'm';
  q('.vdt-confirm').disabled = false;

  if (result.candidates.length > 1) {
    result.candidates.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vdt-cand' + (c === lastValue ? ' sel' : '');
      b.textContent = c;
      b.addEventListener('click', () => {
        lastValue = c;
        v.textContent = c;
        cands.querySelectorAll('.vdt-cand').forEach((x) => x.classList.toggle('sel', x.textContent === c));
      });
      cands.appendChild(b);
    });
    if (result.ambiguous) msg('⚠ ' + (curFam === 'he' ? 'יותר מאפשרות אחת' : curFam === 'ar' ? 'أكثر من احتمال' : 'more than one candidate'));
  }
}

/** Short haptic cue where supported (TSC5/Android); silently no-ops elsewhere. */
function buzz(ms) {
  if (navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (_) { /* ignore */ }
  }
}

function setMic(state) {
  // state: 'idle' | 'starting' | 'live'. The 'live' flip happens on audiostart —
  // the moment the engine actually captures — so the user doesn't out-talk the
  // mic and lose the first word (field bug: spoken 1.34 heard as «נקודה שלושים
  // וארבע» → 0.34).
  const btn = overlayEl.querySelector('.vdt-mic');
  btn.classList.toggle('live', state === 'live');
  const l = L();
  overlayEl.querySelector('.vdt-mic-label').textContent =
    state === 'live' ? l.listening : state === 'starting' ? l.starting : l.hold;
}

function toggleListen() {
  if (listening) stopListen();
  else startListen();
}

function startListen() {
  const Ctor = SR();
  if (!Ctor) { msg(L().noApi); return; }
  try { recog && recog.abort(); } catch (_) { /* ignore */ }

  recog = new Ctor();
  const locales = VOICE_LANGS[langFamily(curFam)] || VOICE_LANGS.en;
  recog.lang = locales[0];
  recog.continuous = false;
  recog.interimResults = true;
  recog.maxAlternatives = 5;

  recog.onstart = () => { listening = true; setMic('starting'); msg(''); };
  recog.onaudiostart = () => { setMic('live'); buzz(10); }; // "speak now" cue
  recog.onerror = (e) => {
    listening = false;
    setMic('idle');
    const code = e && e.error;
    if (code === 'not-allowed' || code === 'service-not-allowed') msg(L().denied);
    else if (code === 'network') msg(L().network);
    else if (code === 'no-speech') msg(L().nospeech);
    else if (code === 'language-not-supported') msg(`${L().noApi} (${recog.lang})`);
    else if (code !== 'aborted') msg(String(code || 'error'));
  };
  recog.onend = () => { listening = false; setMic('idle'); };
  recog.onresult = (ev) => {
    const alts = [];
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i];
      for (let j = 0; j < res.length; j++) alts.push(res[j].transcript);
    }
    if (!alts.length) return;
    // Field debugging: what did the engine actually offer?
    console.log('[voice-depth-test] alternatives:', alts);
    const best = pickBestParse(alts, curFam);
    render(best);
    if (best.leadingPoint) msg('⚠ ' + L().clipped);
  };

  try { recog.start(); } catch (err) { msg(String(err && err.message ? err.message : err)); }
}

function stopListen() {
  try { recog && recog.stop(); } catch (_) { /* ignore */ }
  listening = false;
  setMic('idle');
}

function onConfirm() {
  if (!lastValue) return;
  stopListen();
  msg(`${L().wouldSet}: ${lastValue} m ✓`, true);
  // Test surface: nothing is written. This is where a real edge write would go.
  console.log('[voice-depth-test] confirmed value =', lastValue, 'lang =', curFam);
}

export function openVoiceDepthTest() {
  if (!overlayEl) build();
  resetReadout();
  overlayEl.classList.add('open');
}

function close() {
  stopListen();
  if (overlayEl) overlayEl.classList.remove('open');
}

function injectFab() {
  if (document.querySelector('.vdt-fab')) return;
  ensureStyles();
  const fab = document.createElement('button');
  fab.className = 'vdt-fab';
  fab.type = 'button';
  fab.innerHTML = `${icon('mic')}<span>Voice test</span>`;
  fab.addEventListener('click', openVoiceDepthTest);
  document.body.appendChild(fab);
}

/**
 * Call once at app init. Injects the floating test button only when the app was
 * opened with ?voicetest=1 (remembered in localStorage; ?voicetest=0 clears it).
 * Also exposes window.__openVoiceDepthTest() for console use.
 */
export function initVoiceDepthTest() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('voicetest')) {
      const on = params.get('voicetest') !== '0';
      if (on) localStorage.setItem(FLAG_KEY, '1');
      else localStorage.removeItem(FLAG_KEY);
    }
    window.__openVoiceDepthTest = openVoiceDepthTest;
    if (localStorage.getItem(FLAG_KEY) === '1') injectFab();
  } catch (_) {
    // localStorage / URL unavailable — no-op, feature simply stays hidden.
  }
}
