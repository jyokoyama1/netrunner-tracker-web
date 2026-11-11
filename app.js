/* Netrunner Tracker — plain JS, no build step. */
(() => {
'use strict';

const VERSION = '1.4.1';
const STORE_KEY = 'nrtracker.v1';
const UNDO_MAX = 50;
const BASE_CLICKS = { corp: 3, runner: 4 };
const SIDE_NAME = { corp: 'Corp', runner: 'Runner' };
const OTHER = { corp: 'runner', runner: 'corp' };
const WIN_AT = 7;
const LIMIT = { clicks: 9, credits: 999, agenda: 99, bad: 99, tags: 99, brain: 99 };
// The Runner's damage counter is stored as `brain`; its name follows the Menu setting (Core damage is the newer name).
const dmgName = () => (settings.damage === 'brain' ? 'Brain damage' : 'Core damage');
const LABEL = {
  clicks: 'Clicks', credits: 'Credits', agenda: 'Agenda points', bad: 'Bad publicity',
  tags: 'Tags', get brain() { return dmgName(); },
};
const LOWER = { clicks: 'clicks', credits: 'credits', agenda: 'agenda points', bad: 'bad publicity',
  tags: 'tags', get brain() { return dmgName().toLowerCase(); } };
/** Use the chosen damage name in any stored text (undo labels are saved with the name at the time). */
const withDmgName = (text) => text.replace(/\b(brain|core) damage/gi, (m) => (m[0] === m[0].toUpperCase() ? dmgName() : dmgName().toLowerCase()));
// Game symbols by Null Signal Games (CC BY-ND 4.0), used as CSS masks tinted in the side's colour.
const ICON = { clicks: 'clicks', credits: 'credits', agenda: 'agenda', bad: 'bad',
  tags: 'tags', brain: 'damage' };
const ico = (name, extra = '') => `<span class="ico ico-${name} ${extra}" aria-hidden="true"></span>`;
// Central servers used by the Runner's mark (NSG icons, tinted Runner colour).
const MARKS = [
  { id: 'hq', name: 'HQ', ico: 'hq' },
  { id: 'rd', name: 'R&D', ico: 'rd' },
  { id: 'archives', name: 'Archives', ico: 'archives' },
];
const markOf = (id) => MARKS.find((m) => m.id === id) || null;
const ROLL_MIN = 2, ROLL_MAX = 50, ROLL_COUNT_MAX = 10;
const ROLL_PRESETS = [3, 5, 6, 8, 10];
/** Unbiased integer in [0, n). Rejection sampling on 32-bit crypto values, so the result is not skewed by a naive modulo. */
function randInt(n) {
  if (!Number.isInteger(n) || n < 1 || n > 0xFFFFFFFF) throw new RangeError('randInt');
  const cap = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  let x;
  do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= cap);
  return x % n;
}
/** k distinct numbers from 1 to n, in the order they were picked. */
function pickDistinct(n, k) {
  n = Math.max(1, Math.min(ROLL_MAX, n | 0));
  k = Math.max(1, Math.min(k | 0, n, ROLL_COUNT_MAX));
  const a = Array.from({ length: n }, (_, i) => i + 1);
  const out = [];
  for (let i = 0; i < k; i++) {
    const j = i + randInt(n - i);
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    out.push(a[i]);
  }
  return out;
}
function pickMarkId() { return MARKS[randInt(MARKS.length)].id; }
function clampRollMax(n) { n = n | 0; return Math.max(ROLL_MIN, Math.min(ROLL_MAX, n)); }
function clampRollCount(k, maxN) { k = k | 0; return Math.max(1, Math.min(k, maxN | 0, ROLL_COUNT_MAX)); }
// Faction glyphs by Null Signal Games (CC BY-ND 4.0). `mask: true` = black artwork, shown tinted.
const FACTIONS = {
  corp: [
    { id: 'hb', name: 'Haas-Bioroid', src: 'assets/nsg/factions/NSG_HB.png' },
    { id: 'jinteki', name: 'Jinteki', src: 'assets/nsg/factions/NSG_JINTEKI.png' },
    { id: 'nbn', name: 'NBN', src: 'assets/nsg/factions/NSG_NBN.svg' },
    { id: 'weyland', name: 'Weyland Consortium', src: 'assets/nsg/factions/NSG_WEYLAND.svg' },
  ],
  runner: [
    { id: 'anarch', name: 'Anarch', src: 'assets/nsg/factions/NSG_ANARCH.svg' },
    { id: 'criminal', name: 'Criminal', src: 'assets/nsg/factions/NSG_CRIMINAL.svg' },
    { id: 'shaper', name: 'Shaper', src: 'assets/nsg/factions/NSG_SHAPER.svg' },
    { id: 'adam', name: 'Adam', src: 'assets/nsg/factions/NSG_ADAM.svg' },
    { id: 'apex', name: 'Apex', src: 'assets/nsg/factions/NSG_APEX.svg', mask: true },
    { id: 'sunny', name: 'Sunny Lebeau', src: 'assets/nsg/factions/NSG_SUNNY.svg' },
  ],
};
const factionOf = (side) => FACTIONS[side].find((f) => f.id === (settings.faction || {})[side]) || null;
function sideMark(side, cls = 'side-mark') {
  const f = factionOf(side);
  if (!f) return svg(side === 'corp' ? 'i-corp' : 'i-runner');
  if (f.mask) return `<span class="${cls} masked" style="-webkit-mask-image:url(${f.src});mask-image:url(${f.src})" aria-hidden="true"></span>`;
  return `<img class="${cls}" src="${f.src}" alt="" draggable="false">`;
}
const NSG_CREDIT = 'Game symbols and faction glyphs by <a href="https://nullsignal.games/" target="_blank" rel="noopener">Null Signal Games</a>, used under <a href="https://creativecommons.org/licenses/by-nd/4.0/" target="_blank" rel="noopener">CC BY-ND 4.0</a> (recoloured in the app).';
const MINOR = { corp: ['agenda', 'bad'], runner: ['agenda', 'tags', 'brain'] };
// One-side modes can also show one of the opponent's counters (Menu toggles; the values live in the opponent's state).
const OPP = { corp: { side: 'runner', key: 'tags', setting: 'oppTags' }, runner: { side: 'corp', key: 'bad', setting: 'oppBad' } };
const oppShown = (side) => state.mode === side && !!settings[OPP[side].setting];
const markShown = (side) => side === 'runner' && (state.mode === 'both' || state.mode === 'runner');

// ---------------------------------------------------------------- state
function newSide(side) {
  const s = { clicks: 0, credits: 5, agenda: 0, idUsed: false };
  if (side === 'corp') s.bad = 0; else { s.tags = 0; s.brain = 0; }
  return s;
}
function newGame(mode) {
  const st = { mode, turn: 1, active: mode === 'runner' ? 'runner' : 'corp',
    corp: newSide('corp'), runner: newSide('runner'), mark: null };
  if (mode === 'both' || mode === 'corp') st.corp.clicks = BASE_CLICKS.corp;
  if (mode === 'runner') st.runner.clicks = BASE_CLICKS.runner;
  return st;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let state = newGame('both');
let undo = [];               // [{ s: previousState, label }]
let settings = { showId: true, faceToFace: true, faceChosen: false, damage: 'core', faction: { corp: '', runner: '' }, oppTags: false, oppBad: false, rollMax: 5, rollCount: 1 };
let helpSeen = false;

function validState(s) {
  return s && typeof s === 'object' && ['both', 'corp', 'runner'].includes(s.mode)
    && Number.isFinite(s.turn) && ['corp', 'runner'].includes(s.active)
    && s.corp && s.runner && Number.isFinite(s.corp.credits) && Number.isFinite(s.runner.credits);
}
/** Bring an older saved state up to date: drop recurring credits (removed in 1.3) and fill in any missing counters. */
function migrate(st) {
  for (const side of ['corp', 'runner']) {
    const s = st[side];
    delete s.rec; delete s.recMax;
    const fresh = newSide(side);
    for (const k of Object.keys(fresh)) if (typeof s[k] !== typeof fresh[k]) s[k] = fresh[k];
  }
  if (!markOf(st.mark)) st.mark = null;
  return st;
}
let migrated = false;
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (!validState(d.state)) return;
    state = migrate(d.state);
    undo = Array.isArray(d.undo) ? d.undo.filter((u) => u && validState(u.s)).slice(-UNDO_MAX).map((u) => ({ s: migrate(u.s), label: String(u.label || '') })) : [];
    const saved = d.settings || {};
    settings = Object.assign(settings, saved);
    // 1.3: face-to-face became the default for both-sides mode. Older saves don't record whether the user picked it, so:
    // on = they turned it on themselves (keep it); off = switch to the new default once. From now on the Menu choice sticks.
    if (!('faceChosen' in saved)) {
      settings.faceChosen = saved.faceToFace === true;
      settings.faceToFace = true;
    }
    settings.faceToFace = !!settings.faceToFace; settings.faceChosen = !!settings.faceChosen;
    settings.faction = Object.assign({ corp: '', runner: '' }, settings.faction || {});
    if (settings.damage !== 'brain') settings.damage = 'core';
    settings.oppTags = !!settings.oppTags; settings.oppBad = !!settings.oppBad;
    settings.rollMax = clampRollMax(settings.rollMax == null ? 5 : settings.rollMax);
    settings.rollCount = clampRollCount(settings.rollCount == null ? 1 : settings.rollCount, settings.rollMax);
    helpSeen = !!d.helpSeen;
    migrated = true; // write the upgraded save back once
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
function doUndo(flip = false) {
  const u = undo.pop();
  if (!u) { toast('Nothing to undo', '', 1700, flip); return; }
  stopMarkAnim();
  state = u.s;
  save();
  render();
  toast(`Undone: ${withDmgName(u.label)}`, '', 1700, flip);
}
/** Face-to-face: the Corp half (and a Corp end-turn bar) is turned 180 degrees toward the Corp player. */
function faceToFace() { return state.mode === 'both' && settings.faceToFace; }

function sign(n) { return n > 0 ? `+${n}` : `${n}`; }
function sideVisible(side) { return state.mode === 'both' || state.mode === side; }

/** Step a counter by d, within its limits. */
function stepCounter(st, side, key, d) {
  const s = st[side];
  s[key] = Math.max(0, Math.min(LIMIT[key], s[key] + d));
}

function endTurn(flip = false) {
  if (state.mode === 'both') {
    const from = state.active, to = OTHER[from];
    commit(`End of ${SIDE_NAME[from]} turn`, (st) => {
      st[from].clicks = 0;
      st[to].clicks = BASE_CLICKS[to];
      st.corp.idUsed = false; st.runner.idUsed = false;
      if (from === 'runner') st.mark = null;
      if (to === 'corp') st.turn = Math.min(999, st.turn + 1);
      st.active = to;
    });
    toast(`${SIDE_NAME[to]} turn · ${BASE_CLICKS[to]} clicks`, '', 1700, flip);
  } else {
    const side = state.mode;
    commit(`End of turn ${state.turn}`, (st) => {
      st[side].clicks = BASE_CLICKS[side];
      st.corp.idUsed = false; st.runner.idUsed = false;
      if (side === 'runner') st.mark = null;
      st.turn = Math.min(999, st.turn + 1);
    });
    toast(`Turn ${state.turn} · ${BASE_CLICKS[side]} clicks ready`);
  }
}
/** Both-sides games start face-to-face unless the user has set that option themselves. */
function applyFaceDefault() { if (!settings.faceChosen) settings.faceToFace = true; }
function startNewGame(mode) {
  applyFaceDefault();
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

// Main-screen click buttons (ID toggle, top/bottom bars) share the same guard:
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
function tile(side, key, extraClass = '', label = LABEL[key]) {
  const [minus, plus] = stepBtns(side, key);
  let inner;
  if (key === 'clicks') {
    inner = `<div class="value"><span class="num" data-num="${side}-clicks">0</span></div>`;
  } else {
    inner = key === 'credits'
      ? `<div class="value credits-value">${ico('credits', 'cr-glyph')}<span class="num" data-num="${side}-credits">0</span></div>`
      : `<div class="value"><span class="num" data-num="${side}-${key}">0</span></div>`;
  }
  const hint = key === 'clicks' ? `<div class="pips" data-pips="${side}" aria-hidden="true"></div>` : '';
  return `<div class="tile ${extraClass}" data-tile="${side}-${key}">
    <div class="tile-label">${key === 'clicks' || key === 'credits' ? '' : ico(ICON[key])}<span>${label}</span>${hint}</div>
    <div class="stepper">${minus}${inner}${plus}</div></div>`;
}
function panel(side) {
  const items = MINOR[side].map((k) => [side, k, '', LABEL[k]]);
  if (oppShown(side)) { const o = OPP[side]; items.push([o.side, o.key, `opp ${o.side}`, `${SIDE_NAME[o.side]} ${LOWER[o.key]}`]); }
  const minor = items.map(([sd, k, cls, lbl], i) => tile(sd, k, `${cls}${items.length % 2 && i === items.length - 1 ? ' wide' : ''}`, lbl)).join('');
  return `<section class="panel ${side}" data-panel="${side}" aria-label="${SIDE_NAME[side]}">
    <div class="panel-head">
      <div class="side-name" title="${factionOf(side) ? factionOf(side).name : ''}">${sideMark(side)}<span>${SIDE_NAME[side]}</span></div>
      <span class="live-dot" aria-hidden="true"></span>
      <span class="spacer"></span>
      ${markShown(side) ? `<button class="mark-btn" data-mark-btn="${side}" aria-label="Declare mark"></button>` : ''}
      <button class="id-toggle" data-id="${side}" aria-pressed="false">${svg('i-id')}<span class="id-lbl">ID<span class="id-full"> ability</span></span><span class="id-state"></span></button>
    </div>
    <div class="hero">${tile(side, 'clicks')}${tile(side, 'credits')}</div>
    <div class="minor">${minor}</div>
  </section>`;
}

function build() {
  const key = `${state.mode}|${settings.faceToFace}|${settings.showId}|${settings.damage}|${JSON.stringify(settings.faction)}|${oppShown('corp')}|${oppShown('runner')}|${markShown('runner')}`;
  if (key === builtKey) return false;
  builtKey = key;
  const sides = state.mode === 'both' ? ['corp', 'runner'] : [state.mode];
  board.className = `board ${state.mode === 'both' ? 'both' : 'single'}`;
  const tb = $('topbar');
  if (tb.parentNode === board) $('app').insertBefore(tb, $('app').firstChild); // keep it out of the rebuild
  board.innerHTML = sides.map(panel).join('');
  const app = $('app'), topbar = $('topbar');
  const f2f = faceToFace();
  app.classList.toggle('f2f', f2f);
  if (f2f) {
    board.querySelector('[data-panel="corp"]').classList.add('flipped');
    board.insertBefore(topbar, board.querySelector('[data-panel="runner"]'));
  }
  $('corpBar').hidden = !f2f;
  board.querySelectorAll('.id-toggle').forEach((b) => {
    b.hidden = !settings.showId;
    guardedClick(b, () => {
      const side = b.dataset.id;
      commit(`${SIDE_NAME[side]} ID ability ${state[side].idUsed ? 'ready again' : 'used'}`, (st) => { st[side].idUsed = !st[side].idUsed; });
    });
  });
  board.querySelectorAll('[data-mark-btn]').forEach((b) => guardedClick(b, () => declareMark()));
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

let markAnim = null; // { timers, btn }
function markHtml(id) {
  const m = markOf(id);
  return m ? `${ico(m.ico)}<span>${m.name}</span>` : `${svg('i-dice')}<span>Mark</span>`;
}
function paintMark(btn, id = state.mark, revealing = !!(markAnim && !id)) {
  if (!btn) return;
  const m = markOf(id);
  btn.classList.toggle('set', !!m && !revealing);
  btn.classList.toggle('revealing', !!revealing);
  btn.disabled = !!m || !!revealing;
  btn.setAttribute('aria-label', m ? `Mark is ${m.name}` : 'Declare mark');
  btn.innerHTML = revealing ? markHtml(id || 'hq') : markHtml(id);
}
function stopMarkAnim() {
  if (!markAnim) return;
  (markAnim.timers || []).forEach(clearTimeout);
  markAnim = null;
}
/** Pick HQ, R&D or Archives uniformly, play a short reveal, then keep it until the Runner's turn ends. Undoable. */
function declareMark() {
  if (state.mark || markAnim) return;
  const pick = pickMarkId();
  const btns = [...board.querySelectorAll('[data-mark-btn]')];
  stopMarkAnim();
  const timers = [];
  markAnim = { timers };
  const order = [0, 1, 2, 0, 1, 2, 0, 1, 2];
  order.forEach((i, step) => {
    timers.push(setTimeout(() => {
      btns.forEach((b) => paintMark(b, MARKS[i].id, true));
    }, 70 * step));
  });
  timers.push(setTimeout(() => {
    markAnim = null;
    commit(`Runner mark: ${markOf(pick).name}`, (st) => { st.mark = pick; });
    toast(`Mark is ${markOf(pick).name}`);
  }, 70 * order.length + 80));
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
      pips.innerHTML = Array.from({ length: total }, (_, i) => `<span class="pip${i >= base ? ' extra' : ''}"><i></i></span>`).join('');
    }
    pips.classList.toggle('many', total > 5);
    [...pips.children].forEach((p, i) => p.classList.toggle('on', i < s.clicks));
    setNum(`${side}-clicks`, s.clicks);
    setNum(`${side}-credits`, s.credits);
    for (const k of MINOR[side]) setNum(`${side}-${k}`, s[k]);
    if (oppShown(side)) { const o = OPP[side]; setNum(`${o.side}-${o.key}`, state[o.side][o.key]); }
    pn.querySelector(`[data-tile="${side}-agenda"]`).classList.toggle('won', s.agenda >= WIN_AT);
    // ID
    const idb = pn.querySelector(`[data-id="${side}"]`);
    idb.classList.toggle('used', s.idUsed);
    idb.setAttribute('aria-pressed', String(s.idUsed));
    idb.querySelector('.id-state').textContent = s.idUsed ? 'Used' : 'Ready';
    // disable minus at zero / plus at limit
    pn.querySelectorAll('.step[data-key]').forEach((b) => {
      const k = b.dataset.key, d = +b.dataset.d, v = state[b.dataset.side][k];
      b.classList.toggle('off', d < 0 ? v <= 0 : v >= LIMIT[k]);
    });
    if (markShown(side) && !markAnim) paintMark(pn.querySelector('[data-mark-btn]'));
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
  const f2f = faceToFace();
  const endSide = f2f ? 'runner' : both ? state.active : state.mode;
  const endIdle = f2f && state.active !== 'runner';
  $('endBtn').className = `end-btn ${endSide}${endIdle ? ' idle' : ''}`;
  $('endBtn').setAttribute('aria-disabled', String(endIdle));
  $('endLabel').textContent = f2f ? 'End Runner turn' : both ? `End ${SIDE_NAME[state.active]} turn` : 'End turn';
  $('undoBtn').disabled = undo.length === 0;
  $('undoCount').textContent = undo.length;
  const corpIdle = state.active !== 'corp';
  $('corpEndBtn').className = `end-btn corp${corpIdle ? ' idle' : ''}`;
  $('corpEndBtn').setAttribute('aria-disabled', String(corpIdle));
  $('corpUndoBtn').disabled = undo.length === 0;
  $('corpUndoCount').textContent = undo.length;
  fitLayout();
}

// --------------------------------------------------------------- toast
let toastTimer = 0;
function toast(msg, kind = '', ms = 1700, flip = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show ${kind}${flip && faceToFace() ? ' flipped' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, ms);
}

// -------------------------------------------------------------- sheets
const overlay = $('overlay'), sheet = $('sheet');
let sheetOpenedAt = 0, sheetHandlers = {}, sheetOnCancel = null, closeTimer = 0;

function openSheet(html, handlers, { onCancel = null, kind = '', flip = false } = {}) {
  cancelPress();
  clearTimeout(closeTimer);
  sheet.innerHTML = html;
  sheet.dataset.kind = kind;
  overlay.classList.toggle('flipped', flip);
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

function helpBody(short = false) {
  return `<ul class="help-list">
    <li><span class="hi">${svg('i-plus')}</span><span>Tap <b>plus</b> or <b>minus</b> to change a counter. Hold to change it fast.</span></li>
    <li><span class="hi">${ico('clicks')}</span><span><b>Clicks</b> show as click symbols. Bright ones are clicks you still have; spent ones are crossed out.</span></li>
    ${short ? '' : `<li><span class="hi r">${ico('damage')}</span><span>The Corp tracks <b>bad publicity</b>; the Runner tracks <b>tags</b> and <b>${dmgName().toLowerCase()}</b>. Rename it to ${settings.damage === 'brain' ? 'Core damage' : 'Brain damage'} in the Menu. Tracking one side? The Menu can also show the opponent's tags or bad publicity.</span></li>`}
    <li><span class="hi r">${svg('i-next')}</span><span><b>End turn</b> gives the next turn its clicks (Corp 3, Runner 4) and makes ID abilities ready again.</span></li>
    ${short ? '' : `<li><span class="hi">${svg('i-dice')}</span><span>The <b>dice</b> button opens a roller: pick a number from 1 to N, or several different numbers (for example, 2 net damage from the grip). Rolls are not added to Undo.</span></li>`}
    ${short ? '' : `<li><span class="hi r">${ico('hq')}</span><span>Tap <b>Mark</b> when an ability tells the Runner to identify their mark. It picks <b>HQ</b>, <b>R&amp;D</b> or <b>Archives</b> at random and stays until the Runner's turn ends. You can undo it.</span></li>`}
    <li><span class="hi">${svg('i-undo')}</span><span><b>Undo</b> steps back through your last ${UNDO_MAX} changes, even after closing the app.</span></li>
    <li><span class="hi">${svg('i-share')}</span><span>In Safari, tap <b>Share</b> then <b>Add to Home Screen</b> for a full-screen app that works offline.</span></li>
  </ul>`;
}
function openHelp(first) {
  if (first) {
    let pick = 'both';
    const html = () => `<h2>Netrunner Tracker</h2>
      <p class="lead">Your tokens, on your phone. Everything saves as you go.</p>
      ${helpBody(true)}
      <div class="section-label">What are you tracking?</div>
      ${modeChoices(pick)}
      <p class="credit">${NSG_CREDIT}</p>
      <div class="row sticky-row"><button class="btn primary neutral" data-act="start">Start game</button></div>`;
    const handlers = {
      mode: (el) => { pick = el.dataset.mode; sheet.querySelectorAll('.choice').forEach((c) => c.classList.toggle('selected', c.dataset.mode === pick)); },
      start: () => {
        helpSeen = true;
        applyFaceDefault();
        state = newGame(pick); undo = [];
        save(); closeSheet(); render();
      },
    };
    openSheet(html(), handlers, { onCancel: false, kind: 'welcome' });
  } else {
    openSheet(`<h2>How it works</h2>${helpBody()}
      <div class="row"><button class="btn primary neutral" data-act="close">Got it</button></div>
      <p class="credit">${NSG_CREDIT}</p>`,
      { close: closeSheet }, { kind: 'help' });
  }
}

function openEndTurn(flip = false) {
  const both = state.mode === 'both';
  const side = both ? state.active : state.mode;
  const next = both ? OTHER[side] : side;
  const nextTurn = both ? (next === 'corp' ? state.turn + 1 : state.turn) : state.turn + 1;
  const lead = both
    ? `${SIDE_NAME[next]} starts turn ${nextTurn} with ${BASE_CLICKS[next]} clicks.`
    : `Turn ${nextTurn} starts with ${BASE_CLICKS[side]} clicks.`;
  openSheet(`<h2>${both ? `End ${SIDE_NAME[side]} turn?` : `End turn ${state.turn}?`}</h2>
    <p class="lead">${lead}</p>
    <div class="row"><button class="btn" data-act="cancel">Cancel</button>
    <button class="btn primary ${next}" data-act="confirm">${svg('i-next')}End turn</button></div>`,
  { cancel: closeSheet, confirm: () => { closeSheet(); endTurn(flip); } }, { kind: 'endturn', flip });
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
      ${state.mode === 'corp' ? `<button class="menu-item opp-item runner" data-act="opp" data-k="oppTags">${ico('tags', 'menu-ico')}<span class="grow">Show Runner tags<small style="display:block;font-size:13px;color:var(--muted);font-weight:500">Track your opponent's tags here too</small></span><span class="switch${settings.oppTags ? ' on' : ''}"></span></button>` : ''}
      ${state.mode === 'runner' ? `<button class="menu-item opp-item corp" data-act="opp" data-k="oppBad">${ico('bad', 'menu-ico')}<span class="grow">Show Corp bad publicity<small style="display:block;font-size:13px;color:var(--muted);font-weight:500">Track your opponent's bad publicity here too</small></span><span class="switch${settings.oppBad ? ' on' : ''}"></span></button>` : ''}
      ${state.mode === 'both' ? `<button class="menu-item" data-act="face">${svg('i-corp')}<span class="grow">Corp faces across the table<small style="display:block;font-size:13px;color:var(--muted);font-weight:500">Turns the Corp half and its own End turn button upside down</small></span><span class="switch${settings.faceToFace ? ' on' : ''}"></span></button>` : ''}
      ${['corp', 'runner'].filter((sd) => state.mode === 'both' || state.mode === sd).map((sd) => `<button class="menu-item faction-item ${sd}" data-act="faction" data-side="${sd}">
        <span class="fm">${sideMark(sd, 'menu-mark')}</span><span class="grow">${SIDE_NAME[sd]} faction<small style="display:block;font-size:13px;color:var(--muted);font-weight:500">${factionOf(sd) ? factionOf(sd).name : 'None (plain icon)'}</small></span><span class="chev">›</span></button>`).join('')}
      <div class="menu-item seg-item">${ico('damage', 'menu-ico')}<span class="grow">Runner damage name</span></div>
      <div class="seg" role="radiogroup" aria-label="Runner damage name">
        <button class="seg-btn${settings.damage !== 'brain' ? ' on' : ''}" role="radio" aria-checked="${settings.damage !== 'brain'}" data-act="damage" data-v="core">Core damage</button>
        <button class="seg-btn${settings.damage === 'brain' ? ' on' : ''}" role="radio" aria-checked="${settings.damage === 'brain'}" data-act="damage" data-v="brain">Brain damage</button>
      </div>
      <button class="menu-item" data-act="newgame">${svg('i-new')}<span class="grow">New game</span></button>
      <button class="menu-item" data-act="help">${svg('i-help')}<span class="grow">Help</span></button>
    </div>
    <div class="row"><button class="btn primary neutral" data-act="close">Done</button></div>
    <div class="version">Netrunner Tracker ${VERSION}</div>
    <p class="credit">${NSG_CREDIT}</p>`;
  const refresh = () => { const top = sheet.scrollTop; sheet.innerHTML = html(); sheet.scrollTop = top; };
  openSheet(html(), {
    setmode: (el) => { setMode(el.dataset.mode); refresh(); },
    showId: () => { settings.showId = !settings.showId; save(); render(); refresh(); },
    face: () => { settings.faceToFace = !settings.faceToFace; settings.faceChosen = true; save(); render(); refresh(); },
    damage: (el) => { settings.damage = el.dataset.v === 'brain' ? 'brain' : 'core'; save(); render(); refresh(); },
    faction: (el) => openFaction(el.dataset.side),
    opp: (el) => { const k = el.dataset.k; settings[k] = !settings[k]; save(); render(); refresh(); },
    newgame: () => openNewGame(),
    help: () => openHelp(false),
    close: closeSheet,
  }, { kind: 'menu' });
}

function openFaction(side) {
  const cur = (settings.faction || {})[side] || '';
  const opts = [{ id: '', name: 'None', sub: 'Plain icon' }, ...FACTIONS[side]];
  openSheet(`<h2>${SIDE_NAME[side]} faction</h2>
    <p class="lead">Shows the faction glyph next to "${SIDE_NAME[side]}".</p>
    <div class="faction-grid">${opts.map((f) => {
      const mark = f.id ? (f.mask ? `<span class="fg masked ${side}" style="-webkit-mask-image:url(${f.src});mask-image:url(${f.src})"></span>` : `<img class="fg" src="${f.src}" alt="">`) : `<span class="fg plain ${side}">${svg(side === 'corp' ? 'i-corp' : 'i-runner')}</span>`;
      return `<button class="faction-opt${f.id === cur ? ' selected' : ''}" data-act="pick" data-id="${f.id}">${mark}<span>${f.name}</span></button>`;
    }).join('')}</div>
    <div class="row"><button class="btn" data-act="back">Back</button></div>`, {
    pick: (el) => { settings.faction = Object.assign({}, settings.faction, { [side]: el.dataset.id }); save(); render(); openMenu(); },
    back: () => openMenu(),
  }, { kind: 'faction' });
}

function rollCountLabel(k) {
  return k === 1 ? 'Pick 1 number' : `Pick ${k} different cards`;
}

let rollTimer = 0, rollBusy = false;
function stopRollAnim() { clearTimeout(rollTimer); rollBusy = false; }

function openRoll(flip = false) {
  stopRollAnim();
  let last = null;
  const maxEl = () => sheet.querySelector('[data-roll-max]');
  const countEl = () => sheet.querySelector('[data-roll-count]');
  const lblEl = () => sheet.querySelector('[data-roll-count-lbl]');
  const resultEl = () => sheet.querySelector('[data-roll-result]');
  const rollBtn = () => sheet.querySelector('[data-act="roll"]');
  const paint = () => {
    settings.rollMax = clampRollMax(settings.rollMax);
    settings.rollCount = clampRollCount(settings.rollCount, settings.rollMax);
    if (maxEl()) maxEl().textContent = settings.rollMax;
    if (countEl()) countEl().textContent = settings.rollCount;
    if (lblEl()) lblEl().textContent = rollCountLabel(settings.rollCount);
    sheet.querySelectorAll('.preset').forEach((b) => b.classList.toggle('on', +b.dataset.n === settings.rollMax));
    const minusMax = sheet.querySelector('[data-act="nmax"][data-d="-1"]');
    const plusMax = sheet.querySelector('[data-act="nmax"][data-d="1"]');
    const minusC = sheet.querySelector('[data-act="ncount"][data-d="-1"]');
    const plusC = sheet.querySelector('[data-act="ncount"][data-d="1"]');
    if (minusMax) minusMax.classList.toggle('off', settings.rollMax <= ROLL_MIN);
    if (plusMax) plusMax.classList.toggle('off', settings.rollMax >= ROLL_MAX);
    if (minusC) minusC.classList.toggle('off', settings.rollCount <= 1);
    if (plusC) plusC.classList.toggle('off', settings.rollCount >= Math.min(settings.rollMax, ROLL_COUNT_MAX));
    save();
  };
  const showResult = (vals, landing) => {
    const box = resultEl();
    if (!box) return;
    const many = vals.length >= 3, lots = vals.length >= 5;
    box.className = `roll-result${many ? ' many' : ''}${lots ? ' lots' : ''}`;
    box.innerHTML = vals.map((n) => `<span class="roll-num${landing ? ' land' : ' spinning'}">${n}</span>`).join('');
  };
  const roll = () => {
    if (rollBusy || !sheetOpen || sheet.dataset.kind !== 'roll') return;
    const n = settings.rollMax, k = settings.rollCount;
    const vals = pickDistinct(n, k);
    last = vals;
    rollBusy = true;
    if (rollBtn()) rollBtn().disabled = true;
    let frames = 0;
    const tick = () => {
      if (!sheetOpen || sheet.dataset.kind !== 'roll') { rollBusy = false; return; }
      frames++;
      // visual flicker only; the real result was already chosen
      showResult(Array.from({ length: k }, () => 1 + randInt(n)), false);
      if (frames < 8) { rollTimer = setTimeout(tick, 50); return; }
      showResult(vals, true);
      rollBusy = false;
      const b = rollBtn();
      if (b) { b.disabled = false; const lbl = b.querySelector('[data-roll-lbl]'); if (lbl) lbl.textContent = 'Roll again'; }
    };
    tick();
  };
  openSheet(`<h2>Roll</h2>
    <p class="lead">A random number from 1 to N. Use it for net damage, a random card from HQ, or any other random pick.</p>
    <div class="section-label">Upper number</div>
    <div class="sheet-stepper roll-step">
      <button class="step minus" data-act="nmax" data-d="-1" aria-label="Lower the upper number">${svg('i-minus')}</button>
      <div class="v" data-roll-max>5</div>
      <button class="step plus" data-act="nmax" data-d="1" aria-label="Raise the upper number">${svg('i-plus')}</button>
    </div>
    <div class="presets">${ROLL_PRESETS.map((n) => `<button class="preset" data-act="preset" data-n="${n}">${n}</button>`).join('')}</div>
    <div class="section-label">How many</div>
    <div class="sheet-stepper roll-step">
      <button class="step minus" data-act="ncount" data-d="-1" aria-label="Fewer numbers">${svg('i-minus')}</button>
      <div class="v" data-roll-count>1</div>
      <button class="step plus" data-act="ncount" data-d="1" aria-label="More numbers">${svg('i-plus')}</button>
    </div>
    <div class="roll-count-lbl" data-roll-count-lbl>Pick 1 number</div>
    <div class="roll-result" data-roll-result></div>
    <div class="row"><button class="btn" data-act="close">Close</button>
    <button class="btn primary" data-act="roll">${svg('i-dice')}<span data-roll-lbl>Roll</span></button></div>`, {
    nmax: (el) => { settings.rollMax = clampRollMax(settings.rollMax + +el.dataset.d); paint(); },
    ncount: (el) => { settings.rollCount = clampRollCount(settings.rollCount + +el.dataset.d, settings.rollMax); paint(); },
    preset: (el) => { settings.rollMax = clampRollMax(+el.dataset.n); paint(); },
    roll,
    close: () => { stopRollAnim(); closeSheet(); },
  }, { kind: 'roll', flip, onCancel: () => stopRollAnim() });
  paint();
}

// Keep the app sized to the visible viewport (Safari toolbars, iPhone notch / home bar).
/** If stacked Clicks/Credits would overflow the board, sit them side by side. Called from render (after any rebuild, before paint) and whenever the board is resized. */
let fitting = false;
function fitLayout() {
  if (fitting || !board) return;
  fitting = true;
  try {
    const cls = board.classList.contains('single') ? 'compact-hero' : board.classList.contains('both') ? 'compact-both' : '';
    if (!cls) {
      board.classList.remove('compact-hero', 'compact-both');
      return;
    }
    board.classList.remove(cls === 'compact-hero' ? 'compact-both' : 'compact-hero');
    if (!board.classList.contains(cls)) {
      if (board.scrollHeight > board.clientHeight + 1) board.classList.add(cls);
    } else if (board.clientHeight - board.scrollHeight > 100) {
      board.classList.remove(cls);
      void board.offsetHeight;
      if (board.scrollHeight > board.clientHeight + 1) board.classList.add(cls);
    }
  } finally { fitting = false; }
}

function syncViewport() {
  const vv = window.visualViewport;
  const h = Math.round((vv && vv.height) || window.innerHeight);
  const top = Math.round((vv && vv.offsetTop) || 0);
  const root = document.documentElement;
  root.style.setProperty('--app-h', h + 'px');
  root.style.setProperty('--app-top', top + 'px');
  root.style.setProperty('--vh', (h / 100) + 'px');
}
syncViewport();
window.addEventListener('resize', syncViewport);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncViewport);
  window.visualViewport.addEventListener('scroll', syncViewport);
}
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => fitLayout()).observe(board);
  new ResizeObserver(() => fitLayout()).observe($('app'));
}

// --------------------------------------------------------------- wiring
guardedClick($('undoBtn'), () => doUndo(false));
guardedClick($('corpUndoBtn'), () => doUndo(true));
// In face-to-face mode each End turn button ends only its own side's turn; the other one is idle.
guardedClick($('endBtn'), () => {
  if (faceToFace() && state.active !== 'runner') { toast('Corp turn now · the Corp ends it from their side'); return; }
  openEndTurn(false);
});
guardedClick($('corpEndBtn'), () => {
  if (state.active !== 'corp') { toast('Runner turn now · the Runner ends it from their side', '', 1700, true); return; }
  openEndTurn(true);
});
guardedClick($('helpBtn'), () => openHelp(false));
guardedClick($('menuBtn'), openMenu);
guardedClick($('rollBtn'), () => openRoll(false));
guardedClick($('corpRollBtn'), () => openRoll(true));

load();
if (migrated) save();
render();
lockInput(300);
if (!helpSeen) openHelp(true);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// test hook (read-only snapshot)
window.__nrt = {
  get state() { return clone(state); },
  get undoCount() { return undo.length; },
  get settings() { return clone(settings); },
  VERSION, randInt, pickDistinct, pickMarkId,
  ROLL_MIN, ROLL_MAX, ROLL_COUNT_MAX,
};
})();
