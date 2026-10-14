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
  btn.textContent = `${invalid ? '⚠ ' : ''}${currentId ? (currentName || currentId) : t(role === 'authority' ? 'pickAuthority' : 'pickOperator')} ▾`;
  root.appendChild(btn);

  /** @type {HTMLElement | null} */ let pop = null;
  /** @type {Company[]} */ let shown = [];
  let active = 0;
  const close = () => { pop?.remove(); pop = null; document.removeEventListener('mousedown', outside, true); };
  const outside = (/** @type {MouseEvent} */ e) => { if (!root.contains(/** @type {Node} */ (e.target))) close(); };
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
    root.appendChild(pop);
    input.addEventListener('input', () => { active = 0; render(input.value); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // the grid must not act on these keys
      if (e.key === 'Escape') { close(); btn.focus(); }
      else if (e.key === 'ArrowDown') { active = Math.min(active + 1, shown.length - 1); render(input.value); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(input.value); e.preventDefault(); }
      else if (e.key === 'Enter' && shown[active]) { pick(shown[active]); e.preventDefault(); }
    });
    document.addEventListener('mousedown', outside, true);
    render('');
    input.focus();
  });
  return root;
}
