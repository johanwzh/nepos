// One year of a calendar (timetable structure spec §3): twelve months with ISO week numbers,
// Sundays and public holidays in red, active days coloured. Click or drag to switch days.
import { norwegianHolidays } from '../core/holidays.js';
import { addDays, weekdayOf, isoWeek } from '../core/calendars.js';

const MONTHS = {
  no: ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const HEAD = { no: ['Uke', 'Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'], en: ['Week', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] };

/** @type {{ start: string, days: string[], on: boolean, root: HTMLElement } | null} */
let drag = null;
/** @type {((days: string[], on: boolean) => void) | null} */
let dragDone = null;
/** Mark the days between the drag's first day and `day` (either direction). @param {string} day */
function stretchTo(day) {
  if (!drag) return;
  const [a, b] = drag.start <= day ? [drag.start, day] : [day, drag.start];
  /** @type {string[]} */ const days = [];
  for (let d = a; d <= b; d = addDays(d, 1)) days.push(d);
  drag.days = days;
  for (const c of drag.root.querySelectorAll('.yv-day')) c.classList.toggle('pending', days.includes(/** @type {HTMLElement} */ (c).dataset.date ?? ''));
}

function cancelDrag() {
  if (drag) for (const c of drag.root.querySelectorAll('.yv-day.pending')) c.classList.remove('pending');
  drag = null; dragDone = null;
}

document.addEventListener('mouseup', () => {
  if (!drag || !dragDone) return;
  const { days, on } = drag;
  const done = dragDone;
  drag = null; dragDone = null;
  done(days, on);
});

/**
 * @param {HTMLElement} container
 * @param {{ year: number, active: Set<string>, readOnly?: boolean, lang: 'no' | 'en', onChange: (days: string[], on: boolean) => void }} opts
 */
export function renderYearView(container, { year, active, readOnly = false, lang, onChange }) {
  const holidays = norwegianHolidays(year);
  const root = document.createElement('div');
  root.className = 'yv';
  for (let m = 0; m < 12; m++) {
    const month = document.createElement('div');
    month.className = 'yv-month';
    const title = document.createElement('div');
    title.className = 'yv-title';
    title.textContent = `${MONTHS[lang][m]} ${year}`;
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr>${HEAD[lang].map((h) => `<th>${h}</th>`).join('')}</tr></thead>`;
    const tbody = document.createElement('tbody');
    const first = `${year}${String(m + 1).padStart(2, '0')}01`;
    let d = first;
    let row = /** @type {HTMLTableRowElement | null} */ (null);
    /** @type {string[]} */ const hol = [];
    while (d.slice(4, 6) === first.slice(4, 6)) {
      const wd = weekdayOf(d);
      if (!row || wd === 1) {
        row = document.createElement('tr');
        const wk = document.createElement('td');
        wk.className = 'yv-week';
        wk.textContent = String(isoWeek(d));
        row.appendChild(wk);
        for (let i = 1; i < wd && d === first; i++) row.appendChild(document.createElement('td'));
        tbody.appendChild(row);
      }
      const cell = document.createElement('td');
      cell.className = 'yv-day';
      cell.dataset.date = d;
      cell.textContent = String(Number(d.slice(6, 8)));
      if (active.has(d)) cell.classList.add('on');
      if (wd === 7) cell.classList.add('sun');
      const name = holidays.get(d);
      if (name) { cell.classList.add('hol'); cell.title = name; hol.push(`${Number(d.slice(6, 8))}.${m + 1}: ${name}`); }
      if (!readOnly) {
        cell.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return; // only the left button switches days
          e.preventDefault();
          const day = /** @type {string} */ (cell.dataset.date);
          drag = { start: day, days: [day], on: !active.has(day), root };
          dragDone = onChange;
          cell.classList.add('pending');
        });
        cell.addEventListener('mouseover', (e) => {
          if (!drag) return;
          // Released outside the window: the mouseup never came, so the drag ends here.
          if ((e.buttons & 1) === 0) { cancelDrag(); return; }
          stretchTo(/** @type {string} */ (cell.dataset.date));
        });
      }
      row.appendChild(cell);
      d = addDays(d, 1);
    }
    table.appendChild(tbody);
    month.append(title, table);
    if (hol.length) {
      const h = document.createElement('div');
      h.className = 'yv-hol';
      h.textContent = hol.join(' · ');
      month.appendChild(h);
    }
    root.appendChild(month);
  }
  container.innerHTML = '';
  container.appendChild(root);
}
