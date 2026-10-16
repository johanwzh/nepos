// A searchable organisation picker for one role (organisations spec §4). Lists companies with
// that role: the project's own first, then the rest of Entur's register.
import { t } from '../i18n/strings.js';
import { searchCompanies } from '../core/orgs.js';

/** @typedef {import('../core/orgs.js').Company} Company */

/**
 * @param {{ role: 'authority' | 'operator', currentId: string, currentName: string,
 *           projectCompanies: Company[], registerCompanies: Company[], invalid: string,
 *           disabled: boolean, onPick: (company: Company) => void }} opts
 */
export function createOrgPicker({ role, currentId, currentName, projectCompanies, registerCompanies, invalid, disabled, onPick }) {
  const root = document.createElement('div');
  root.className = `org-pick${invalid ? ' invalid' : ''}`;
  if (invalid) root.title = invalid;
  const btn = document.createElement('button');
  btn.className = 'org-pick-btn';
  btn.disabled = disabled;
  // A chip: the role as a small caption, the organisation, a caret (styled in nepos2.css).
  const caption = document.createElement('span');
  caption.className = 'org-pick-role';
  caption.textContent = t(role === 'authority' ? 'roleAuthority' : 'roleOperator');
  const name = document.createElement('span');
  name.className = 'org-pick-name';
  name.textContent = `${invalid ? '⚠ ' : ''}${currentId ? (currentName || currentId) : t(role === 'authority' ? 'pickAuthority' : 'pickOperator')}`;
  const caret = document.createElement('span');
  caret.className = 'org-pick-caret';
  caret.textContent = '▾';
  btn.append(caption, name, caret);
  root.appendChild(btn);

  /** @type {HTMLElement | null} */ let pop = null;
  /** @type {Company[]} */ let shown = [];
  let active = 0;
  // The list opens on top of the page (in document.body, fixed to the button), so no page section
  // can clip it, push it aside or squeeze it: below the button when there is room, else above.
  const place = () => {
    if (!pop) return;
    if (!root.isConnected) { close(); return; } // the page was redrawn under it
    const b = btn.getBoundingClientRect();
    const w = pop.offsetWidth || 320, h = pop.offsetHeight || 360;
    const below = window.innerHeight - b.bottom, above = b.top;
    const top = below >= h + 8 || below >= above ? b.bottom + 4 : Math.max(4, b.top - h - 4);
    pop.style.top = `${top}px`;
    pop.style.left = `${Math.max(4, Math.min(b.left, window.innerWidth - w - 4))}px`;
  };
  const close = () => {
    pop?.remove(); pop = null;
    document.removeEventListener('mousedown', outside, true);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
  };
  const outside = (/** @type {MouseEvent} */ e) => { if (!root.contains(/** @type {Node} */ (e.target)) && !pop?.contains(/** @type {Node} */ (e.target))) close(); };
  const pick = (/** @type {Company} */ c) => { close(); onPick(c); };

  /** @param {string} q */
  const render = (q) => {
    if (!pop) return;
    const list = /** @type {HTMLElement} */ (pop.querySelector('.org-pick-list'));
    const inProject = searchCompanies(projectCompanies, role, q);
    const ids = new Set(inProject.map((c) => c.organisationId || c.name));
    const rest = searchCompanies(registerCompanies, role, q).filter((c) => !ids.has(c.organisationId || c.name));
    shown = [...inProject, ...rest];
    active = Math.min(active, Math.max(shown.length - 1, 0));
    list.innerHTML = '';
    const section = (/** @type {string} */ text) => { const s = document.createElement('div'); s.className = 'org-pick-section'; s.textContent = text; list.appendChild(s); };
    shown.forEach((c, i) => {
      if (i === 0 && inProject.length) section(t('orgInProject'));
      if (i === inProject.length && rest.length) section(t('orgAll'));
      const row = document.createElement('div');
      row.className = `org-pick-row${i === active ? ' active' : ''}${c[role]?.id === currentId ? ' current' : ''}`;
      const b = document.createElement('b');
      b.textContent = c.name;
      const small = document.createElement('small');
      small.textContent = [c.legalName, c.companyNumber].filter(Boolean).join(' · ');
      row.append(b, small);
      row.addEventListener('mousedown', (e) => { e.preventDefault(); pick(c); });
      list.appendChild(row);
    });
    if (!shown.length) section(t('orgNoMatch'));
  };

  btn.addEventListener('click', () => {
    if (disabled) return;
    if (pop) { close(); return; }
    pop = document.createElement('div');
    pop.className = 'org-pick-pop';
    const input = document.createElement('input');
    input.className = 'org-pick-search';
    input.placeholder = t('orgSearchPh');
    const list = document.createElement('div');
    list.className = 'org-pick-list';
    pop.append(input, list);
    pop.style.position = 'fixed';
    document.body.appendChild(pop);
    input.addEventListener('input', () => { active = 0; render(input.value); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // the grid must not act on these keys
      if (e.key === 'Escape') { close(); btn.focus(); }
      else if (e.key === 'ArrowDown') { active = Math.min(active + 1, shown.length - 1); render(input.value); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(input.value); e.preventDefault(); }
      else if (e.key === 'Enter' && shown[active]) { pick(shown[active]); e.preventDefault(); }
    });
    document.addEventListener('mousedown', outside, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    render('');
    place();
    input.focus();
  });
  return root;
}
