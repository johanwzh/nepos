// @ts-nocheck
// The mini-jog, as handed over (C:/Claude/1869/references/mini-jog); kept as is apart from this path.
import { h, s } from './dom.js';

/**
 * A jog dial — a small *relative* encoder, the on-screen cousin of a mixer's jog/shuttle wheel.
 *
 * It is deliberately NOT the arc dial. The arc dial is **absolute** (its angle encodes the value,
 * it fills a sweep, and it stops at its ends) — right only for a hard-bounded value whose position
 * in range is meaningful. A jog's resting angle means nothing: you spin it and it just turns, so it
 * is honest for an **unbounded** value, which has no "full" to show. No arc fill, no rim ticks —
 * only a dot orbiting the rim to show motion, and the dot does NOT track the value (it is feedback,
 * not a gauge).
 *
 * Two modes:
 *
 * - **Nudge mode** (`onNudge`): holds no value, emits one notch per step. For the mini control
 *   beside a field that owns its own value (the itineraries count).
 * - **Value mode** (`value` + `onChange`): holds the value and shows it like the arc dial — the
 *   **raw number inside**, the **translated readout below** (`format`). Drag spins and scrubs by
 *   `step`, wheel steps by `fineStep`, click opens a type box, and pulling below `min` drops into
 *   **Auto** (omit) when `auto` is given.
 *
 * Input is a vertical **drag** (up = more), never a circular gesture (which feels awful with a
 * mouse). The dot turns gently with the drag so you can read its direction — its speed is
 * deliberately decoupled from the value steps, which can be coarse.
 *
 * @param {object} o
 * @param {number} [o.size] px
 * @param {boolean} [o.detents] nudge mode: snap the dot to notch angles
 * @param {number} [o.pxPerNotch] drag distance for one value step (default 9)
 * @param {(dir: 1 | -1, coarse: boolean) => void} [o.onNudge] nudge mode
 * @param {number|null} [o.value] value mode: the current value
 * @param {number} [o.min] @param {number} [o.step] @param {number} [o.fineStep] @param {boolean} [o.integer]
 * @param {(v:number)=>string} [o.format] value mode: the translated readout shown *below* the dial
 * @param {(v:number)=>{tone:string}} [o.zones] value mode: health tint (amber = caution, red = error)
 * @param {{label?:string, caption?:string}} [o.auto] value mode: omit-state below the minimum
 * @param {(v:number|null)=>void} [o.onChange] value mode
 * @param {boolean} [o.downward] nudge mode: down = more (drag, wheel, arrow) — times run downwards in a timetable
 */
export function jogDial({
  size = 26,
  detents = false,
  pxPerNotch = 9,
  onNudge,
  value,
  min,
  step = 1,
  fineStep,
  integer = false,
  format,
  zones,
  auto,
  onChange,
  downward = false,
}) {
  const valueMode = typeof onChange === 'function';
  const C = 50;
  const R = 40;
  const nudgeDeg = detents ? 30 : 22; // nudge mode: dot jumps per notch
  const DOT_DEG_PER_PX = 1.4; // value mode: gentle, readable dot speed, independent of value step
  const WHEEL_DEG = 16;
  const fine = fineStep ?? step;
  const hasMin = Number.isFinite(min);
  let angle = 0; // dot angle — visual only, never the value

  const pt = (r, deg) => {
    const t = (deg * Math.PI) / 180;
    return [C + r * Math.sin(t), C - r * Math.cos(t)];
  };

  const indicator = s('g', {});
  const valueText = valueMode
    ? s('text', { x: C, y: C, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'jd-value' }, '')
    : null;
  const read = valueMode ? h('div', { class: 'jd-read' }) : null;

  // Nudge mode: the dot is an indicator of the same size on every dial (user 2026-10-24), not scaled with it
  const DOT_PX = 2.75;
  const dotR = valueMode ? 4 : (DOT_PX * 100) / size;
  const sgn = downward && !valueMode ? -1 : 1;
  const draw = () => {
    const a = detents ? Math.round(angle / nudgeDeg) * nudgeDeg : angle;
    const [x, y] = pt(Math.min(R - 8, R - dotR - 3), a);
    indicator.replaceChildren(s('circle', { class: 'jd-dot', cx: x.toFixed(1), cy: y.toFixed(1), r: dotR.toFixed(2) }));
    if (valueMode) {
      // Raw number inside (what goes on the wire); translated value below — same split as the dial.
      valueText.textContent = value == null ? auto?.label ?? 'Auto' : String(value);
      read.textContent = value == null ? auto?.caption ?? '' : format ? format(value) : '';
      // Unbounded still carries health: amber = caution, red = error. Tint, never resize (P9).
      const tone = (zones && value != null ? zones(value)?.tone : null) ?? 'normal';
      root.classList.toggle('caution', tone === 'caution');
      root.classList.toggle('error', tone === 'error');
    }
  };

  const face = s('circle', { cx: C, cy: C, r: R, fill: 'var(--panel, var(--bg-raised, #fff))', stroke: 'currentColor', 'stroke-width': 2, class: 'jd-rim' });
  const svg = s('svg', { class: 'jd-face', viewBox: '0 0 100 100', width: size, height: size, 'aria-hidden': 'true' }, face, indicator, ...(valueText ? [valueText] : []));

  // ---- value-mode plumbing -------------------------------------------------
  const current = () => (value == null ? (hasMin ? min : 0) : value);
  const commit = (v) => { value = v; draw(); onChange(value); };
  const nudgeValue = (dir, grid) => {
    const base = current();
    let n = base + dir * grid;
    n = integer ? Math.round(n) : Number(n.toPrecision(12));
    if (hasMin && n < min) {
      if (auto) return commit(null);
      n = min;
    }
    commit(n);
  };
  const spinDot = (deg) => { angle += deg; draw(); };

  const typeBox = valueMode ? h('input', { class: 'jd-type', type: 'text', inputmode: integer ? 'numeric' : 'decimal', hidden: true }) : null;
  const openType = () => {
    typeBox.hidden = false;
    typeBox.value = value == null ? '' : String(value);
    typeBox.focus();
    typeBox.select();
  };
  if (typeBox) {
    typeBox.addEventListener('input', (e) => {
      const raw = e.target.value.trim().replace(',', '.');
      if (raw === '') { if (auto) commit(null); return; }
      const n = Number(raw);
      if (Number.isFinite(n)) commit(hasMin ? Math.max(min, integer ? Math.round(n) : n) : integer ? Math.round(n) : n);
    });
    typeBox.addEventListener('blur', () => { typeBox.hidden = true; });
    typeBox.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') typeBox.blur(); e.stopPropagation(); });
  }

  // ---- drag / tap / wheel --------------------------------------------------
  let dragging = false, lastY = 0, startX = 0, startY = 0, moved = false, acc = 0;
  svg.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false; lastY = e.clientY; startX = e.clientX; startY = e.clientY; acc = 0;
    svg.setPointerCapture(e.pointerId); document.body.classList.add('scrubbing'); e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = (lastY - e.clientY) * sgn;
    lastY = e.clientY;
    if (Math.abs(e.clientY - startY) > 2 || Math.abs(e.clientX - startX) > 2) moved = true;
    acc += dy;
    if (valueMode) {
      spinDot(dy * DOT_DEG_PER_PX); // dot turns gently with the drag, readable direction
      while (acc >= pxPerNotch) { acc -= pxPerNotch; nudgeValue(1, step); }
      while (acc <= -pxPerNotch) { acc += pxPerNotch; nudgeValue(-1, step); }
    } else {
      while (acc >= pxPerNotch) { acc -= pxPerNotch; angle += nudgeDeg; draw(); onNudge(1, e.shiftKey); }
      while (acc <= -pxPerNotch) { acc += pxPerNotch; angle -= nudgeDeg; draw(); onNudge(-1, e.shiftKey); }
    }
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    try { svg.releasePointerCapture(e.pointerId); } catch {}
    document.body.classList.remove('scrubbing');
    if (!moved) {
      if (valueMode) openType();
      else {
        const r = svg.getBoundingClientRect();
        const dir = e.clientX - (r.left + r.width / 2) >= 0 ? 1 : -1;
        angle += dir * nudgeDeg; draw(); onNudge(dir, e.shiftKey);
      }
    }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = (e.deltaY < 0 ? 1 : -1) * sgn;
    if (valueMode) { nudgeValue(dir, fine); spinDot(dir * WHEEL_DEG); }
    else { angle += dir * nudgeDeg; draw(); onNudge(dir, e.shiftKey); }
  }, { passive: false });

  const stage = valueMode ? h('span', { class: 'jd-stage' }, svg, typeBox) : svg;
  const root = h(
    'span',
    { class: `jd${detents ? ' jd-detent' : ''}${valueMode ? ' jd-value-mode' : ''}`, tabindex: 0, title: valueMode ? 'Drag to spin · click to type · wheel to fine-step' : 'Drag to scrub · tap a side for ±1 · wheel to step' },
    ...(valueMode ? [stage, read] : [stage])
  );
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'ArrowUp' && sgn === 1) || (e.key === 'ArrowDown' && sgn === -1) || e.key === 'ArrowRight') { e.preventDefault(); if (valueMode) { nudgeValue(1, fine); spinDot(WHEEL_DEG); } else { angle += nudgeDeg; draw(); onNudge(1, e.shiftKey); } }
    if ((e.key === 'ArrowDown' && sgn === 1) || (e.key === 'ArrowUp' && sgn === -1) || e.key === 'ArrowLeft') { e.preventDefault(); if (valueMode) { nudgeValue(-1, fine); spinDot(-WHEEL_DEG); } else { angle -= nudgeDeg; draw(); onNudge(-1, e.shiftKey); } }
  });
  draw();
  return root;
}
