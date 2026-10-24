// Paste special (Ctrl+Shift+V, booking spec 2026-10-22): a small floating box with a toggle per part of what was copied
// inside Nepos. Times: Tider / Av-påstigning / Bestilling-forespørsel / Merknad og datoer. The note row: Merknad / Datoer
// / Bestilling. The last choice is remembered per kind (on this computer).
import { t } from '../i18n/strings.js';
import { openFloatBox } from './float-box.js';

const PARTS = { cell: ['times', 'boarding', 'booking', 'notes'], 'note-row': ['note', 'dates', 'booking'] };
const KEY = { cell: 'nepos.pasteSpecial.cell', 'note-row': 'nepos.pasteSpecial.noteRow' };

/** @param {'cell' | 'note-row'} kind @returns {Set<string>} */
function remembered(kind) {
  try {
    const v = JSON.parse(localStorage.getItem(KEY[kind]) ?? 'null');
    if (Array.isArray(v)) return new Set(v.filter((p) => PARTS[kind].includes(p)));
  } catch { /* not remembered */ }
  return new Set(PARTS[kind]);
}

/** @param {{ kind: 'cell' | 'note-row', x: number, y: number, onApply: (parts: Set<string>) => void }} opts */
export function openPasteSpecial({ kind, x, y, onApply }) {
  const on = remembered(kind);
  const body = document.createElement('div');
  body.className = 'ps';
  body.innerHTML = PARTS[kind].map((p) => `<label class="ps-part" data-v="${p}"><input type="checkbox"${on.has(p) ? ' checked' : ''}> ${t(`ps:${p}`)}</label>`).join('');
  openFloatBox({
    x, y, title: t('psTitle'), body, cls: 'ps-box',
    onApply: () => {
      const parts = new Set([...body.querySelectorAll('.ps-part')].filter((l) => /** @type {HTMLInputElement} */ (l.querySelector('input')).checked).map((l) => /** @type {HTMLElement} */ (l).dataset.v ?? ''));
      try { localStorage.setItem(KEY[kind], JSON.stringify([...parts])); } catch { /* not remembered */ }
      onApply(parts);
    },
  });
}
