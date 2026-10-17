/* Netrunner Tracker — plain JS, no build step. */
(() => {
'use strict';

const VERSION = '1.0.0';
const STORE_KEY = 'nrtracker.v1';
const UNDO_MAX = 50;
const BASE_CLICKS = { corp: 3, runner: 4 };
const SIDE_NAME = { corp: 'Corp', runner: 'Runner' };
const OTHER = { corp: 'runner', runner: 'corp' };
const WIN_AT = 7;
const LIMIT = { clicks: 9, credits: 999, agenda: 99, bad: 99, tags: 99, brain: 99, rec: 20, recMax: 20 };
const LABEL = {
  clicks: 'Clicks', credits: 'Credits', agenda: 'Agenda points', bad: 'Bad publicity',
  tags: 'Tags', brain: 'Brain damage', rec: 'Recurring credits', recMax: 'Recurring refill',
};
const LOWER = { clicks: 'clicks', credits: 'credits', agenda: 'agenda points', bad: 'bad publicity',
  tags: 'tags', brain: 'brain damage', rec: 'recurring credits', recMax: 'recurring refill' };
const ICON = { clicks: 'i-clicks', credits: 'i-credits', agenda: 'i-agenda', bad: 'i-bad',
  tags: 'i-tags', brain: 'i-brain', rec: 'i-rec' };
const MINOR = { corp: ['agenda', 'bad', 'rec'], runner: ['agenda', 'tags', 'brain', 'rec'] };

// ---------------------------------------------------------------- state
function newSide(side) {
  const s = { clicks: 0, credits: 5, agenda: 0, rec: 0, recMax: 0, idUsed: false };
  if (side === 'corp') s.bad = 0; else { s.tags = 0; s.brain = 0; }
  return s;
}
function newGame(mode) {
  const st = { mode, turn: 1, active: mode === 'runner' ? 'runner' : 'corp',
    corp: newSide('corp'), runner: newSide('runner') };
  if (mode === 'both' || mode === 'corp') st.corp.clicks = BASE_CLICKS.corp;
  if (mode === 'runner') st.runner.clicks = BASE_CLICKS.runner;
  return st;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let state = newGame('both');
let undo = [];               // [{ s: previousState, label }]
let settings = { showId: true, faceToFace: false };
let helpSeen = false;

function validState(s) {
  return s && typeof s === 'object' && ['both', 'corp', 'runner'].includes(s.mode)
    && Number.isFinite(s.turn) && ['corp', 'runner'].includes(s.active)
    && s.corp && s.runner && Number.isFinite(s.corp.credits) && Number.isFinite(s.runner.credits);
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (!validState(d.state)) return;
    state = d.state;
    undo = Array.isArray(d.undo) ? d.undo.filter((u) => u && validState(u.s)).slice(-UNDO_MAX) : [];
    settings = Object.assign(settings, d.settings || {});
    helpSeen = !!d.helpSeen;
  } catch (e) { /* corrupt save: start fresh */ }
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, state, undo, settings, helpSeen }));
  } catch (e) { /* storage full or disabled */ }
}

// ------------------------------------------------------- changes + undo
function pushUndo(prev, label) {
  undo.push({ s: prev, label });
  if (undo.length > UNDO_MAX) undo.splice(0, undo.length - UNDO_MAX);
}
/** Apply a change as one undo step. Returns true if anything changed. */
function commit(label, mutate) {
  const prev = clone(state);
  mutate(state);
  if (same(prev, state)) return false;
  pushUndo(prev, label);
  afterChange(prev);
  return true;
}
function afterChange(prev) {
  save();
  render();
  for (const side of ['corp', 'runner']) {
    if (state[side].agenda >= WIN_AT && prev[side].agenda < WIN_AT && sideVisible(side)) {
      toast(`${SIDE_NAME[side]} wins with ${state[side].agenda} agenda points!`, 'win', 2600);
    }
  }
}
function doUndo() {
  const u = undo.pop();
  if (!u) { toast('Nothing to undo'); return; }
  const prev = state;
  state = u.s;
  save();
  render(prev);
  toast(`Undone: ${u.label}`);
}

function sign(n) { return n > 0 ? `+${n}` : `${n}`; }
function sideVisible(side) { return state.mode === 'both' || state.mode === side; }

/** Step a counter by d. Recurring: + above the refill amount also raises the refill amount (a new card). */
function stepCounter(st, side, key, d) {
  const s = st[side];
  if (key === 'rec') {
    const n = Math.max(0, Math.min(LIMIT.rec, s.rec + d));
    s.rec = n;
    if (n > s.recMax) s.recMax = n;
    return;
  }
  if (key === 'recMax') {
    s.recMax = Math.max(0, Math.min(LIMIT.recMax, s.recMax + d));
    if (s.rec > s.recMax) s.rec = s.recMax;
    return;
  }
  s[key] = Math.max(0, Math.min(LIMIT[key], s[key] + d));
}

function endTurn() {
  if (state.mode === 'both') {
    const from = state.active, to = OTHER[from];
    commit(`End of ${SIDE_NAME[from]} turn`, (st) => {
      st[from].clicks = 0;
      st[to].clicks = BASE_CLICKS[to];
      st[to].rec = st[to].recMax;
      st.corp.idUsed = false; st.runner.idUsed = false;
      if (to === 'corp') st.turn = Math.min(999, st.turn + 1);
      st.active = to;
    });
    toast(`${SIDE_NAME[to]} turn · ${BASE_CLICKS[to]} clicks`);
  } else {
    const side = state.mode;
    commit(`End of turn ${state.turn}`, (st) => {
      st[side].clicks = BASE_CLICKS[side];
      st[side].rec = st[side].recMax;
      st.corp.idUsed = false; st.runner.idUsed = false;
      st.turn = Math.min(999, st.turn + 1);
    });
    toast(`Turn ${state.turn} · ${BASE_CLICKS[side]} clicks ready`);
  }
}
function startNewGame(mode) {
  commit('New game', (st) => { Object.assign(st, newGame(mode)); });
  toast(`New game · ${modeName(mode)}`);
}
function setMode(mode) {
  if (state.mode === mode) return;
  commit(`Switch to ${modeName(mode)}`, (st) => {
    st.mode = mode;
    // Single side: make sure the tracked side has clicks to show if it had none (it was waiting).
    if (mode !== 'both' && st[mode].clicks === 0 && st.active !== mode) st[mode].clicks = BASE_CLICKS[mode];
  });
}
function modeName(m) { return m === 'both' ? 'both sides' : `${SIDE_NAME[m]} only`; }

// --------------------------------------------------------------- input
/*
 * Tap-leak protection: a counter only reacts to a press whose pointerdown started on that counter
 * while no dialog was open and outside the lockout that follows every dialog close. The tap that
 * confirms a dialog therefore can never reach a counter underneath, even if the finger stays down.
 */
let sheetOpen = false;
let lockUntil = 0;
const now = () => performance.now();
function inputAllowed() { return !sheetOpen && now() >= lockUntil; }
function lockInput(ms) { lockUntil = Math.max(lockUntil, now() + ms); }

let press = null; // { btn, id, held, timer, repeat, prev, side, key, d }
function stepFromBtn(btn) { return { side: btn.dataset.side, key: btn.dataset.key, d: +btn.dataset.d }; }

function onStepDown(e) {
  const btn = e.target.closest('.step[data-key]');
  if (!btn || btn.closest('.sheet')) return;
  if (!inputAllowed() || (e.button !== undefined && e.button > 0)) return;
  cancelPress();
  const p = { btn, id: e.pointerId, held: false, ...stepFromBtn(btn) };
  press = p;
  btn.classList.add('pressed');
  p.timer = setTimeout(() => startHold(p), 420);
}
function startHold(p) {
  if (press !== p) return;
  p.held = true;
  p.prev = clone(state);
  let count = 0;
  const tick = () => {
    if (press !== p) return;
    const before = clone(state);
    stepCounter(state, p.side, p.key, p.d);
    if (same(before, state)) { p.repeat = setTimeout(tick, 110); return; } // at a limit: wait for release
    count++;
    render();
    p.repeat = setTimeout(tick, count > 12 ? 55 : 110);
  };
  tick();
}
function finishPress(apply) {
  const p = press;
  if (!p) return;
  press = null;
  clearTimeout(p.timer); clearTimeout(p.repeat);
  p.btn.classList.remove('pressed');
  const lbl = (delta) => `${SIDE_NAME[p.side]} ${LOWER[p.key]} ${sign(delta)}`;
  if (p.held) {
    if (!same(p.prev, state)) {
      const before = p.key === 'idUsed' ? 0 : p.prev[p.side][p.key];
      pushUndo(p.prev, lbl(state[p.side][p.key] - before));
      afterChange(p.prev);
    }
  } else if (apply) {
    const before = state[p.side][p.key];
    commit('', (st) => stepCounter(st, p.side, p.key, p.d));
    if (undo.length && undo[undo.length - 1].label === '') {
      undo[undo.length - 1].label = lbl(state[p.side][p.key] - before);
      save();
    }
  }
}
function cancelPress() { finishPress(false); }
function onStepUp(e) {
  if (!press || e.pointerId !== press.id) return;
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  const inside = !!hit && hit.closest('.step') === press.btn;
  finishPress(inside);
}

document.addEventListener('pointerdown', onStepDown);
document.addEventListener('pointerup', onStepUp);
document.addEventListener('pointercancel', (e) => { if (press && e.pointerId === press.id) cancelPress(); });
document.addEventListener('pointerleave', (e) => { if (press && e.pointerId === press.id && e.target === press.btn) cancelPress(); }, true);
// keyboard activation of steppers (no pointer)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.step[data-key]');
  if (btn && !btn.closest('.sheet') && e.detail === 0 && inputAllowed()) {
    const { side, key, d } = stepFromBtn(btn);
    commit(`${SIDE_NAME[side]} ${LOWER[key]} ${d > 0 ? '+1' : '-1'}`, (st) => stepCounter(st, side, key, d));
  }
});

// Main-screen click buttons (ID toggle, recurring editor, top/bottom bars) share the same guard:
// the pointerdown must have started while input was allowed.
let downAllowed = true;
document.addEventListener('pointerdown', (e) => { downAllowed = inputAllowed() || !!e.target.closest('.sheet'); }, true);
function guardedClick(el, fn) {
  el.addEventListener('click', (e) => {
    if (!inputAllowed() || (e.detail !== 0 && !downAllowed)) return;
    fn(e);
  });
}

// no pinch zoom / double-tap zoom / bounce
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => {
  if (e.touches && e.touches.length > 1) { e.preventDefault(); return; }
  const sc = e.target.closest && e.target.closest('.board, .sheet');
  if (!sc || sc.scrollHeight <= sc.clientHeight + 1) e.preventDefault();
}, { passive: false });
document.addEventListener('contextmenu', (e) => e.preventDefault());

// -------------------------------------------------------------- render
const $ = (id) => document.getElementById(id);
const board = $('board');
let builtKey = '';

function svg(id) { return `<svg aria-hidden="true"><use href="#${id}"/></svg>`; }
function stepBtns(side, key) {
  const name = `${SIDE_NAME[side]} ${LOWER[key]}`;
  return [
    `<button class="step minus" data-side="${side}" data-key="${key}" data-d="-1" aria-label="${name} minus one">${svg('i-minus')}</button>`,
    `<button class="step plus" data-side="${side}" data-key="${key}" data-d="1" aria-label="${name} plus one">${svg('i-plus')}</button>`,
  ];
}
function tile(side, key, extraClass = '') {
  const [minus, plus] = stepBtns(side, key);
  let inner;
  if (key === 'clicks') {
    inner = `<div class="value"><span class="num" data-num="${side}-clicks">0</span></div>`;
  } else if (key === 'rec') {
    inner = `<button class="value value-btn" data-edit-rec="${side}" aria-label="Set ${SIDE_NAME[side]} recurring credits"><span class="num" data-num="${side}-rec">0</span><span class="sub" data-sub="${side}-rec"></span></button>`;
  } else {
    inner = `<div class="value"><span class="num" data-num="${side}-${key}">0</span></div>`;
  }
  const hint = key === 'clicks' ? `<div class="pips" data-pips="${side}" aria-hidden="true"></div>` : '';
  return `<div class="tile ${extraClass}" data-tile="${side}-${key}">
    <div class="tile-label">${svg(ICON[key])}<span>${LABEL[key]}</span>${hint}</div>
    <div class="stepper">${minus}${inner}${plus}</div></div>`;
}
function panel(side) {
  const minor = MINOR[side].map((k, i, arr) => tile(side, k, arr.length % 2 && i === arr.length - 1 ? 'wide' : '')).join('');
  return `<section class="panel ${side}" data-panel="${side}" aria-label="${SIDE_NAME[side]}">
    <div class="panel-head">
      <div class="side-name">${svg(side === 'corp' ? 'i-corp' : 'i-runner')}<span>${SIDE_NAME[side]}</span></div>
      <span class="live-dot" aria-hidden="true"></span>
      <span class="spacer"></span>
      <button class="id-toggle" data-id="${side}" aria-pressed="false">${svg('i-id')}<span>ID ability</span><span class="id-state"></span></button>
    </div>
    <div class="hero">${tile(side, 'clicks')}${tile(side, 'credits')}</div>
    <div class="minor">${minor}</div>
  </section>`;
}

function build() {
  const key = `${state.mode}|${settings.faceToFace}|${settings.showId}`;
  if (key === builtKey) return false;
  builtKey = key;
  const sides = state.mode === 'both' ? ['corp', 'runner'] : [state.mode];
  board.className = `board ${state.mode === 'both' ? 'both' : 'single'}`;
  board.innerHTML = sides.map(panel).join('');
  if (state.mode === 'both' && settings.faceToFace) board.querySelector('[data-panel="corp"]').classList.add('flipped');
  board.querySelectorAll('.id-toggle').forEach((b) => {
    b.hidden = !settings.showId;
    guardedClick(b, () => {
      const side = b.dataset.id;
      commit(`${SIDE_NAME[side]} ID ability ${state[side].idUsed ? 'ready again' : 'used'}`, (st) => { st[side].idUsed = !st[side].idUsed; });
    });
  });
  board.querySelectorAll('[data-edit-rec]').forEach((b) => guardedClick(b, () => openRecSheet(b.dataset.editRec)));
  return true;
}

let shown = {};
function setNum(id, value) {
  const el = board.querySelector(`[data-num="${id}"]`);
  if (!el) return;
  const old = shown[id];
  if (old === value) return;
  el.textContent = value;
  if (old !== undefined) {
    el.classList.remove('bump-up', 'bump-down');
    void el.offsetWidth;
    el.classList.add(value > old ? 'bump-up' : 'bump-down');
  }
  shown[id] = value;
}

function render() {
  if (build()) shown = {};
  const both = state.mode === 'both';
  const sides = both ? ['corp', 'runner'] : [state.mode];
  for (const side of sides) {
    const s = state[side];
    const active = both ? state.active === side : true;
    const pn = board.querySelector(`[data-panel="${side}"]`);
    pn.classList.toggle('active', active);
    pn.classList.toggle('waiting', both && !active);
    // clicks
    const base = BASE_CLICKS[side];
    const total = Math.max(base, s.clicks);
    const pips = pn.querySelector(`[data-pips="${side}"]`);
    if (pips.children.length !== total) {
      pips.innerHTML = Array.from({ length: total }, (_, i) => `<span class="pip${i >= base ? ' extra' : ''}"></span>`).join('');
    }
    pips.classList.toggle('many', total > 5);
    [...pips.children].forEach((p, i) => p.classList.toggle('on', i < s.clicks));
    setNum(`${side}-clicks`, s.clicks);
    setNum(`${side}-credits`, s.credits);
    for (const k of MINOR[side]) setNum(`${side}-${k}`, s[k]);
    pn.querySelector(`[data-sub="${side}-rec"]`).textContent = s.recMax ? `of ${s.recMax}` : 'tap to set';
    pn.querySelector(`[data-tile="${side}-agenda"]`).classList.toggle('won', s.agenda >= WIN_AT);
    // ID
    const idb = pn.querySelector(`[data-id="${side}"]`);
    idb.classList.toggle('used', s.idUsed);
    idb.setAttribute('aria-pressed', String(s.idUsed));
    idb.querySelector('.id-state').textContent = s.idUsed ? 'Used' : 'Ready';
    // disable minus at zero / plus at limit
    pn.querySelectorAll('.step[data-key]').forEach((b) => {
      const k = b.dataset.key, d = +b.dataset.d;
      b.classList.toggle('off', d < 0 ? s[k] <= 0 : s[k] >= LIMIT[k]);
    });
  }
  // top bar
  const tn = $('turnNum');
  if (tn.textContent !== String(state.turn)) {
    tn.textContent = state.turn;
    tn.classList.remove('bump-up'); void tn.offsetWidth; tn.classList.add('num', 'bump-up');
  }
  const st = $('status');
  const winner = ['corp', 'runner'].find((sd) => sideVisible(sd) && state[sd].agenda >= WIN_AT);
  if (winner) {
    st.className = 'status win';
    st.innerHTML = `${svg('i-trophy')}<span>${SIDE_NAME[winner]} wins!</span>`;
  } else if (both) {
    st.className = `status ${state.active}`;
    st.innerHTML = `<span class="dot"></span><span>${SIDE_NAME[state.active]} turn</span>`;
  } else {
    st.className = `status ${state.mode}`;
    st.innerHTML = `<span class="dot"></span><span>Tracking ${SIDE_NAME[state.mode]}</span>`;
  }
  // bottom bar
  const endSide = both ? state.active : state.mode;
  $('endBtn').className = `end-btn ${endSide}`;
  $('endLabel').textContent = both ? `End ${SIDE_NAME[state.active]} turn` : 'End turn';
  $('undoBtn').disabled = undo.length === 0;
  $('undoCount').textContent = undo.length;
}

// --------------------------------------------------------------- toast
let toastTimer = 0;
function toast(msg, kind = '', ms = 1700) {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, ms);
}

// -------------------------------------------------------------- sheets
const overlay = $('overlay'), sheet = $('sheet');
let sheetOpenedAt = 0, sheetHandlers = {}, sheetOnCancel = null, closeTimer = 0;

function openSheet(html, handlers, { onCancel = null, kind = '' } = {}) {
  cancelPress();
  clearTimeout(closeTimer);
  sheet.innerHTML = html;
  sheet.dataset.kind = kind;
  sheetHandlers = handlers || {};
  sheetOnCancel = onCancel;
  sheetOpen = true;
  sheetOpenedAt = now();
  overlay.hidden = false;
  overlay.classList.remove('closing');
  void overlay.offsetWidth;
  overlay.classList.add('open');
  sheet.scrollTop = 0;
}
function closeSheet() {
  if (!sheetOpen) return;
  sheetOpen = false;
  // The overlay keeps catching taps while it fades out, and counters stay locked a bit longer.
  lockInput(450);
  overlay.classList.remove('open');
  overlay.classList.add('closing');
  closeTimer = setTimeout(() => { overlay.hidden = true; overlay.classList.remove('closing'); }, 330);
}
overlay.addEventListener('click', (e) => {
  if (!sheetOpen) return;
  // ignore a double tap that opened the sheet and immediately lands on it
  if (now() - sheetOpenedAt < 250) return;
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'backdrop') { if (sheetOnCancel !== false) { closeSheet(); if (sheetOnCancel) sheetOnCancel(); } return; }
  const fn = sheetHandlers[act];
  if (fn) fn(el);
});
// keep pointer events inside the overlay from reaching anything else
for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend']) {
  overlay.addEventListener(ev, (e) => e.stopPropagation());
}

function modeChoices(selected, act = 'mode') {
  const items = [
    ['both', 'i-both', 'Both sides', 'Corp and Runner on this phone'],
    ['corp', 'i-corp', 'Corp only', 'Each player uses their own phone'],
    ['runner', 'i-runner', 'Runner only', 'Each player uses their own phone'],
  ];
  return `<div class="choices">${items.map(([m, ic, t, s]) =>
    `<button class="choice ${m}${m === selected ? ' selected' : ''}" data-act="${act}" data-mode="${m}">
      <span class="ci">${svg(ic)}</span><span>${t}<small>${s}</small></span><span class="check"></span></button>`).join('')}</div>`;
}

function helpBody() {
  return `<ul class="help-list">
    <li><span class="hi">${svg('i-plus')}</span><span>Tap <b>plus</b> or <b>minus</b> to change a counter. Hold to change it fast.</span></li>
    <li><span class="hi">${svg('i-clicks')}</span><span><b>Clicks</b> show as dots. Bright dots are clicks you still have.</span></li>
    <li><span class="hi r">${svg('i-next')}</span><span><b>End turn</b> gives the next turn its clicks (Corp 3, Runner 4), refills recurring credits and makes ID abilities ready again.</span></li>
    <li><span class="hi">${svg('i-undo')}</span><span><b>Undo</b> steps back through your last ${UNDO_MAX} changes, even after closing the app.</span></li>
    <li><span class="hi r">${svg('i-rec')}</span><span>Tap a <b>recurring credits</b> number to set how many refill each turn.</span></li>
    <li><span class="hi">${svg('i-share')}</span><span>In Safari, tap <b>Share</b> then <b>Add to Home Screen</b> for a full-screen app that works offline.</span></li>
  </ul>`;
}
function openHelp(first) {
  if (first) {
    let pick = 'both';
    const html = () => `<h2>Netrunner Tracker</h2>
      <p class="lead">Your tokens, on your phone. Everything saves as you go.</p>
      ${helpBody()}
      <div class="section-label">What are you tracking?</div>
      ${modeChoices(pick)}
      <div class="row"><button class="btn primary neutral" data-act="start">Start game</button></div>`;
    const handlers = {
      mode: (el) => { pick = el.dataset.mode; sheet.querySelectorAll('.choice').forEach((c) => c.classList.toggle('selected', c.dataset.mode === pick)); },
      start: () => {
        helpSeen = true;
        state = newGame(pick); undo = [];
        save(); closeSheet(); render();
      },
    };
    openSheet(html(), handlers, { onCancel: false, kind: 'welcome' });
  } else {
    openSheet(`<h2>How it works</h2>${helpBody()}
      <div class="row"><button class="btn primary neutral" data-act="close">Got it</button></div>`,
      { close: closeSheet }, { kind: 'help' });
  }
}

function openEndTurn() {
  const both = state.mode === 'both';
  const side = both ? state.active : state.mode;
  const next = both ? OTHER[side] : side;
  const rec = state[next].recMax;
  const nextTurn = both ? (next === 'corp' ? state.turn + 1 : state.turn) : state.turn + 1;
  const lead = both
    ? `${SIDE_NAME[next]} starts turn ${nextTurn} with ${BASE_CLICKS[next]} clicks${rec ? ` and ${rec} recurring credit${rec > 1 ? 's' : ''}` : ''}.`
    : `Turn ${nextTurn} starts with ${BASE_CLICKS[side]} clicks${rec ? ` and ${rec} recurring credit${rec > 1 ? 's' : ''}` : ''}.`;
  openSheet(`<h2>${both ? `End ${SIDE_NAME[side]} turn?` : `End turn ${state.turn}?`}</h2>
    <p class="lead">${lead}</p>
    <div class="row"><button class="btn" data-act="cancel">Cancel</button>
    <button class="btn primary ${next}" data-act="confirm">${svg('i-next')}End turn</button></div>`,
  { cancel: closeSheet, confirm: () => { closeSheet(); endTurn(); } }, { kind: 'endturn' });
}

function openNewGame() {
  let pick = state.mode;
  openSheet(`<h2>Start a new game?</h2>
    <p class="lead">All counters go back to the start. You can undo this.</p>
    ${modeChoices(pick)}
    <div class="row"><button class="btn" data-act="cancel">Cancel</button>
    <button class="btn danger" data-act="confirm">${svg('i-new')}New game</button></div>`,
  {
    mode: (el) => { pick = el.dataset.mode; sheet.querySelectorAll('.choice').forEach((c) => c.classList.toggle('selected', c.dataset.mode === pick)); },
    cancel: closeSheet,
    confirm: () => { closeSheet(); startNewGame(pick); },
  }, { kind: 'newgame' });
}

function openMenu() {
  const html = () => `<h2>Menu</h2>
    <div class="section-label">Tracking</div>
    ${modeChoices(state.mode, 'setmode')}
    <div class="section-label">Options</div>
    <div class="menu-list">
      <button class="menu-item" data-act="showId">${svg('i-id')}<span class="grow">ID ability toggle</span><span class="switch${settings.showId ? ' on' : ''}"></span></button>
      ${state.mode === 'both' ? `<button class="menu-item" data-act="face">${svg('i-corp')}<span class="grow">Corp faces across the table<small style="display:block;font-size:13px;color:var(--muted);font-weight:500">Turns the Corp half upside down</small></span><span class="switch${settings.faceToFace ? ' on' : ''}"></span></button>` : ''}
      <button class="menu-item" data-act="newgame">${svg('i-new')}<span class="grow">New game</span></button>
      <button class="menu-item" data-act="help">${svg('i-help')}<span class="grow">Help</span></button>
    </div>
    <div class="row"><button class="btn primary neutral" data-act="close">Done</button></div>
    <div class="version">Netrunner Tracker ${VERSION}</div>`;
  const refresh = () => { const top = sheet.scrollTop; sheet.innerHTML = html(); sheet.scrollTop = top; };
  openSheet(html(), {
    setmode: (el) => { setMode(el.dataset.mode); refresh(); },
    showId: () => { settings.showId = !settings.showId; save(); render(); refresh(); },
    face: () => { settings.faceToFace = !settings.faceToFace; save(); render(); refresh(); },
    newgame: () => openNewGame(),
    help: () => openHelp(false),
    close: closeSheet,
  }, { kind: 'menu' });
}

function openRecSheet(side) {
  const html = () => {
    const s = state[side];
    const row = (key, title, sub) => `<div class="sheet-stepper"><div class="lbl">${title}<small>${sub}</small></div>
      <button class="step minus" data-act="st" data-k="${key}" data-d="-1" aria-label="${title} minus one" ${s[key] <= 0 ? 'disabled' : ''}>${svg('i-minus')}</button>
      <span class="v">${s[key]}</span>
      <button class="step plus" data-act="st" data-k="${key}" data-d="1" aria-label="${title} plus one" style="--accent-rgb:${side === 'corp' ? '47,208,255' : '255,61,120'};color:var(--${side})">${svg('i-plus')}</button></div>`;
    return `<h2>${SIDE_NAME[side]} recurring credits</h2>
      <p class="lead">Recurring credits come back at the start of each ${SIDE_NAME[side]} turn.</p>
      ${row('rec', 'Available now', 'Spend these this turn')}
      ${row('recMax', 'Refill each turn', 'Total from your cards')}
      <div class="row"><button class="btn primary neutral" data-act="close">Done</button></div>`;
  };
  openSheet(html(), {
    st: (el) => {
      const k = el.dataset.k, d = +el.dataset.d;
      commit(`${SIDE_NAME[side]} ${LOWER[k]} ${sign(d)}`, (st) => stepCounter(st, side, k, d));
      sheet.innerHTML = html();
    },
    close: closeSheet,
  }, { kind: 'rec' });
}

// --------------------------------------------------------------- wiring
guardedClick($('undoBtn'), doUndo);
guardedClick($('endBtn'), openEndTurn);
guardedClick($('helpBtn'), () => openHelp(false));
guardedClick($('menuBtn'), openMenu);

load();
render();
lockInput(300);
if (!helpSeen) openHelp(true);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// test hook (read-only snapshot)
window.__nrt = { get state() { return clone(state); }, get undoCount() { return undo.length; }, VERSION };
})();
