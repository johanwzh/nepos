// The power toolbox (power tools spec 2026-10-24): at the bottom of the line navigator panel, always visible, like a
// Photoshop toolbox. Showing the tools changes nothing; turning a tool on changes the editing context, and while a tool
// is on only that tool works in the grid (typing, pasting and the menus are off). One tool at a time; Esc turns it off.
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

/** The tool that is on ('' for none). */
export const activeTool = () => active;

/** @param {(name: ToolName) => void} fn */
export function onToolChange(fn) { listeners.push(fn); }

/** @param {(minutes: number) => void} fn */
export function setJogHandler(fn) { jogHandler = fn; }

/** @param {() => void} fn */
export function setUnpackHandler(fn) { unpackHandler = fn; }

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
  if (active === 'jog') {
    const read = document.createElement('span');
    read.className = 'pt-read';
    read.textContent = '0 min';
    jogRead = read;
    total = 0;
    const dial = jogDial({
      size: 44, detents: true, pxPerNotch: 9, downward: true, angleRef: jogAngle,
      onNudge: (/** @type {1 | -1} */ dir, /** @type {boolean} */ coarse) => {
        const d = dir * (coarse ? 10 : 1);
        clearTimeout(fadeTimer);
        read.classList.remove('pt-fade');
        total += d;
        read.textContent = `${total > 0 ? '+' : ''}${total} min`;
        jogHandler(d);
      },
    });
    const hint = document.createElement('div');
    hint.className = 'pt-hint';
    hint.textContent = t('ptJogHint');
    body.append(dial, read, hint);
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
    box.innerHTML = `<div class="pt-head">${t('ptTitle')}</div><div class="pt-tools">${TOOLS.map((x) =>
      `<button type="button" class="pt-tool" data-tool="${x.name}" title="Alt+${x.key.toUpperCase()}"><span class="pt-icon">${x.icon}</span> ${t(x.label)}</button>`).join('')}</div><div class="pt-body"></div>`;
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
    if (e.key === 'Escape' && active && !document.querySelector('.float-box')) { e.preventDefault(); e.stopPropagation(); setTool(''); return; }
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const x = TOOLS.find((tool) => tool.key === e.key.toLowerCase());
    if (x) { e.preventDefault(); e.stopPropagation(); setTool(active === x.name ? '' : x.name); }
  }, true);
}
