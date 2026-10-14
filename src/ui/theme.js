// Custom colour themes (navigation spec §7): one main colour and an optional second one; every
// interface shade is derived. Stored per user in this browser. Data colours are never themed.
const KEY = 'nepos.colourTheme';
const PROPS = ['--accent', '--accent-hov', '--accent-bg', '--accent-text', '--accent-2'];
const HEX = /^#[0-9a-f]{6}$/i;

/** @param {string} hex */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** @param {number[]} c */
const toHex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
/** @param {string} a @param {string} b @param {number} t share of a */
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v * t + y[i] * (1 - t))); };
/** @param {string} hex */
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** @param {string} main @param {string | null} second @param {'light' | 'dark'} mode */
export function deriveTheme(main, second, mode) {
  /** @type {Record<string, string>} */
  const out = {
    '--accent': main,
    '--accent-hov': mix(main, '#000000', 0.88),
    '--accent-bg': mode === 'dark' ? mix(main, '#1e1e1e', 0.25) : mix(main, '#ffffff', 0.15),
    '--accent-text': luminance(main) > 0.4 ? '#000000' : '#ffffff',
  };
  if (second) out['--accent-2'] = second;
  return out;
}

/** @returns {{ main: string, second: string | null } | null} */
export function loadColourTheme() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && HEX.test(v.main) ? { main: v.main, second: HEX.test(v.second ?? '') ? v.second : null } : null;
  } catch { return null; }
}

/** @param {{ main: string, second: string | null } | null} theme */
export function saveColourTheme(theme) {
  try { if (theme) localStorage.setItem(KEY, JSON.stringify(theme)); else localStorage.removeItem(KEY); } catch { /* not remembered */ }
}

export function applyColourTheme() {
  const style = document.documentElement.style;
  for (const p of PROPS) style.removeProperty(p);
  const theme = loadColourTheme();
  if (!theme) return;
  const mode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  for (const [k, v] of Object.entries(deriveTheme(theme.main, theme.second, mode))) style.setProperty(k, v);
}

/** @param {string} id */
const input = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));

/** The current accent as #rrggbb (the stored theme, else the stylesheet's), for the dialog's start value. */
function currentAccent() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  return HEX.test(v) ? v.toLowerCase() : '#1a73e8';
}

let wired = false;
function wireDialog() {
  if (wired) return;
  wired = true;
  const dlg = /** @type {HTMLDialogElement} */ (document.getElementById('theme-dlg'));
  input('theme-second-on').addEventListener('change', () => { input('theme-second').disabled = !input('theme-second-on').checked; });
  document.getElementById('theme-cancel')?.addEventListener('click', () => dlg.close());
  document.getElementById('theme-reset')?.addEventListener('click', () => { saveColourTheme(null); applyColourTheme(); dlg.close(); });
  document.getElementById('theme-ok')?.addEventListener('click', () => {
    saveColourTheme({ main: input('theme-main').value, second: input('theme-second-on').checked ? input('theme-second').value : null });
    applyColourTheme();
    dlg.close();
  });
}

/** "Eget tema…": pick one or two colours; OK saves and applies them. */
export function openThemeDialog() {
  const dlg = /** @type {HTMLDialogElement | null} */ (document.getElementById('theme-dlg'));
  if (!dlg) return;
  wireDialog();
  const theme = loadColourTheme();
  input('theme-main').value = theme?.main ?? currentAccent();
  input('theme-second-on').checked = !!theme?.second;
  input('theme-second').value = theme?.second ?? '#ff5959';
  input('theme-second').disabled = !theme?.second;
  dlg.showModal();
}
