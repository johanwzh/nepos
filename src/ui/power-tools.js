// The power toolbox (power tools spec 2026-10-24): at the bottom of the line navigator panel, always visible, like a
// Photoshop toolbox. Showing the tools changes nothing; turning a tool on changes the editing context, and while a tool
// is on only that tool works in the grid (typing, pasting and the menus are off) — except the Tidsforskyver, which leaves
// the cells editable (hypothesis, user 2026-10-28: + and − turn it on). One tool at a time; Esc turns it off.
// Tools: the Jog (time shift, moved here from the context menu) and Virtual intervals.
import { t } from '../i18n/strings.js';
import { jogDial } from './jog/jogDial.js';
import { currentPage } from './shell.js';

/** @typedef {'' | 'jog' | 'intervals'} ToolName */

const TOOLS = /** @type {{ name: ToolName, icon: string, label: string, key: string }[]} */ ([
  { name: 'jog', icon: '⇅', label: 'ptJog', key: 'j' },
  { name: 'intervals', icon: '⋯', label: 'ptIntervals', key: 'i' },
]);

/** @type {ToolName} */
let active = '';
/** The jog's readout: minutes moved for the selection now; a new selection fades it out and starts again. */
let total = 0;
/** @type {HTMLElement | null} */
let jogRead = null;
/** @type {any} */
let fadeTimer = null;
let lastSelection = '';
/** The jog's turn: a spinner, not a value — it never jumps back (user 2026-10-24). */
const jogAngle = { value: 0 };
/** The Tidsforskyver's box in the middle of the page, while the tool is on. @type {HTMLElement | null} */
let tsBox = null;

/**
 * The grid's selection now (user 2026-10-24: the readout counts one selection; a new one fades it out over about a
 * second and starts again from 0). @param {string} key
 */
export function notifySelection(key) {
  if (key === lastSelection) return;
  lastSelection = key;
  if (!jogRead || !total) return;
  total = 0;
  const read = jogRead;
  read.classList.add('pt-fade');
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => { read.textContent = '0 min'; read.classList.remove('pt-fade'); }, 1000);
}
/** @type {((name: ToolName) => void)[]} */
const listeners = [];
/** Unpack the selected block (the grid does it). @type {() => void} */
let unpackHandler = () => {};
/** What a jog notch does (the grid moves its selected times). @type {(minutes: number) => void} */
let jogHandler = () => {};
let keysWired = false;
/** True while the grid holds an Esc of its own (a time being typed): Esc cancels that, not the tool. */
let escGuard = () => false;

/** The tool that is on ('' for none). */
export const activeTool = () => active;

/** @param {(name: ToolName) => void} fn */
export function onToolChange(fn) { listeners.push(fn); }

/** @param {(minutes: number) => void} fn */
export function setJogHandler(fn) { jogHandler = fn; }

/** @param {() => void} fn */
export function setUnpackHandler(fn) { unpackHandler = fn; }

/** @param {() => boolean} fn */
export function setEscGuard(fn) { escGuard = fn; }

/** One step of the Tidsforskyver: counted in its readout, applied by the grid. @param {number} d minutes */
function step(d) {
  clearTimeout(fadeTimer);
  if (jogRead) {
    jogRead.classList.remove('pt-fade');
    total += d;
    jogRead.textContent = `${total > 0 ? '+' : ''}${total} min`;
  }
  jogHandler(d);
}

/**
 * + and − in the timetable (user 2026-10-28): turn the Tidsforskyver on if it is not, and step the selection a minute.
 * @param {1 | -1} dir
 */
export function jogStep(dir) {
  if (active !== 'jog') setTool('jog');
  step(dir);
}

/**
 * Where the Tidsforskyver goes (user 2026-10-26): just above the calendar row — over the table-set tabs and the line's
 * note, locked while a tool is on — centred over the timetable's width. Without a laid-out page (tests): a default size.
 * @returns {{ dial: number, left?: number, top?: number, height?: number }}
 */
function placeAbove() {
  const cal = document.getElementById('cal-bar')?.getBoundingClientRect();
  const main = document.getElementById('edit-main')?.getBoundingClientRect();
  if (!cal || !main || !main.width) return { dial: 64 };
  const height = 92, width = 420;
  return { dial: 64, height, top: Math.max(Math.round(main.top) + 4, Math.round(cal.top - height - 4)), left: Math.round(main.left + main.width / 2 - width / 2) };
}

/** Turn a tool on ('' turns all off). @param {ToolName} name */
export function setTool(name) {
  if (active === name) return;
  active = name;
  // While a tool is on, only the grid and the toolbox respond: the rest of the page is dimmed and locked (CSS)
  document.body.classList.toggle('pt-on', !!name);
  for (const x of TOOLS) document.body.classList.toggle(`pt-${x.name}`, x.name === name);
  draw();
  for (const fn of listeners) fn(name);
}

function draw() {
  const box = document.getElementById('power-tools');
  if (!box) return;
  for (const btn of box.querySelectorAll('.pt-tool')) btn.classList.toggle('on', /** @type {HTMLElement} */ (btn).dataset.tool === active);
  const body = /** @type {HTMLElement} */ (box.querySelector('.pt-body'));
  body.replaceChildren();
  jogRead = null;
  tsBox?.remove();
  tsBox = null;
  if (active === 'jog') {
    const read = document.createElement('span');
    read.className = 'pt-read';
    read.textContent = '0 min';
    jogRead = read;
    total = 0;
    // The dial opens above the timetable, over the calendar row and the timeline (locked while a tool is on), never on
    // the timetable itself (user 2026-10-25); near the panel's edge there was no room to drag
    const band = placeAbove();
    const dial = jogDial({
      size: band.dial, detents: true, pxPerNotch: 9, downward: true, angleRef: jogAngle,
      onNudge: (/** @type {1 | -1} */ dir, /** @type {boolean} */ coarse) => step(dir * (coarse ? 10 : 1)),
    });
    const hint = document.createElement('div');
    hint.className = 'pt-hint';
    hint.textContent = t('ptJogHint');
    const ts = document.createElement('div');
    ts.className = 'ts-box';
    const text = document.createElement('div');
    text.className = 'ts-text';
    const head = document.createElement('div');
    head.className = 'ts-head';
    head.textContent = t('ptJog');
    text.append(head, read, hint);
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'ts-x';
    x.title = 'Esc';
    x.textContent = '✕';
    x.addEventListener('click', () => setTool(''));
    ts.append(dial, text, x);
    ts.addEventListener('keydown', (e) => e.stopPropagation()); // the dial's keys stay with it
    document.body.appendChild(ts);
    if (band.left != null) { ts.style.left = `${band.left}px`; ts.style.top = `${band.top}px`; ts.style.height = `${band.height}px`; }
    tsBox = ts;
  } else if (active === 'intervals') {
    const hint = document.createElement('div');
    hint.className = 'pt-hint';
    hint.textContent = t('ptIntervalsHint');
    const unpack = document.createElement('button');
    unpack.type = 'button';
    unpack.className = 'pop-btn pt-unpack';
    unpack.textContent = t('ivUnpack');
    unpack.addEventListener('click', () => unpackHandler());
    body.append(unpack, hint);
  }
}

/** Build the toolbox in #power-tools and wire its keys (Alt+J, Alt+I; Esc turns the tool off). */
export function initPowerTools() {
  const box = document.getElementById('power-tools');
  if (box) {
    // data-lk: the labels follow a change of language like the rest of the page (shell.js applyLang)
    box.innerHTML = `<div class="pt-head" data-lk="ptTitle">${t('ptTitle')}</div><div class="pt-tools">${TOOLS.map((x) =>
      `<button type="button" class="pt-tool" data-tool="${x.name}" title="Alt+${x.key.toUpperCase()}"><span class="pt-icon">${x.icon}</span> <span data-lk="${x.label}">${t(x.label)}</span></button>`).join('')}</div><div class="pt-body"></div>`;
    for (const btn of box.querySelectorAll('.pt-tool')) {
      btn.addEventListener('click', () => { const name = /** @type {ToolName} */ (/** @type {HTMLElement} */ (btn).dataset.tool); setTool(active === name ? '' : name); });
    }
    // The dial's own keys stay with the dial
    box.addEventListener('keydown', (e) => { if (/** @type {HTMLElement} */ (e.target).closest('.pt-body')) e.stopPropagation(); });
    draw();
  }
  if (keysWired) return;
  keysWired = true;
  document.addEventListener('keydown', (e) => {
    if (currentPage() !== 'edit' || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape' && active && !document.querySelector('.float-box') && !escGuard()) { e.preventDefault(); e.stopPropagation(); setTool(''); return; }
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const x = TOOLS.find((tool) => tool.key === e.key.toLowerCase());
    if (x) { e.preventDefault(); e.stopPropagation(); setTool(active === x.name ? '' : x.name); }
  }, true);
}
