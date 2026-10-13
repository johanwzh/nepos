// Organisations page (F3). IDs are full NeTEx IDs typed by the user (RUT:Authority:1); the role
// comes from the ID. orgs.json is written only when every ID is valid, and never when Nepos could
// not read the file in the first place.
import { app } from './state.js';
import { $, onRefresh, currentPage } from './shell.js';
import { t } from '../i18n/strings.js';
import { validateOrgs, orgRole } from '../core/orgs.js';
import { writeOrgs } from '../project/orgs-store.js';
import { orgIssueMessage } from './messages.js';

/** @type {'saved' | 'not-saved' | ''} */
let status = '';

/** @param {string} id */
function roleLabel(id) {
  const role = orgRole(id);
  return role === 'authority' ? t('roleAuthority') : role === 'operator' ? t('roleOperator') : '—';
}

async function saveIfValid() {
  if (!app.fs || app.orgsError) return;
  if (validateOrgs(app.orgs).length > 0) {
    status = 'not-saved';
  } else {
    await writeOrgs(app.fs, app.orgs);
    status = 'saved';
  }
  renderOrgsPage();
}

export function renderOrgsPage() {
  if (currentPage() !== 'assets') return;
  const body = $('assets-body');
  body.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'assets-title';
  title.textContent = t('orgTitle');
  body.appendChild(title);

  if (!app.meta) {
    const p = document.createElement('p');
    p.className = 'assets-coming';
    p.textContent = t('noProjectOpen');
    body.appendChild(p);
    return;
  }
  if (app.orgsError) {
    const p = document.createElement('p');
    p.className = 'assets-status bad';
    p.textContent = t('orgsUnreadable');
    body.appendChild(p);
    return;
  }

  const hint = document.createElement('p');
  hint.className = 'assets-hint';
  hint.textContent = t('orgsIdHint');
  body.appendChild(hint);

  const hdr = document.createElement('div');
  hdr.className = 'asset-hdr';
  hdr.innerHTML = `<span style="width:228px">${t('orgId')}</span><span style="width:80px">${t('orgRole')}</span><span style="flex:1">${t('orgName')}</span>`;
  body.appendChild(hdr);

  const issues = validateOrgs(app.orgs);
  app.orgs.forEach((org, index) => {
    const rowIssues = issues.filter((i) => i.index === index);
    const row = document.createElement('div');
    row.className = `asset-row${rowIssues.length ? ' invalid' : ''}`;

    const idIn = document.createElement('input');
    idIn.className = 'asset-id-in';
    idIn.value = org.id;
    idIn.placeholder = 'ABC:Operator:1';
    idIn.addEventListener('change', () => { org.id = idIn.value; saveIfValid(); });

    const role = document.createElement('span');
    role.className = 'asset-role';
    role.textContent = roleLabel(org.id);

    const nameIn = document.createElement('input');
    nameIn.className = 'asset-name-in';
    nameIn.value = org.name;
    nameIn.placeholder = t('orgName');
    nameIn.addEventListener('change', () => { org.name = nameIn.value.trim(); saveIfValid(); });

    const del = document.createElement('button');
    del.className = 'asset-del';
    del.title = t('deleteOrg');
    del.textContent = '×';
    del.addEventListener('click', () => {
      if (org.name && !confirm(t('deleteOrgConfirm', org.name))) return;
      app.orgs.splice(index, 1);
      saveIfValid();
    });

    for (const el of [idIn, nameIn]) el.addEventListener('keydown', (e) => e.stopPropagation());
    row.append(idIn, role, nameIn, del);
    body.appendChild(row);
    for (const issue of rowIssues) {
      const msg = document.createElement('div');
      msg.className = 'asset-msg';
      msg.textContent = orgIssueMessage(issue.code);
      body.appendChild(msg);
    }
  });

  const add = document.createElement('button');
  add.className = 'asset-add';
  add.textContent = t('addOrg');
  add.addEventListener('click', () => {
    app.orgs.push({ id: '', name: '' });
    status = 'not-saved';
    renderOrgsPage();
    const inputs = body.querySelectorAll('.asset-id-in');
    /** @type {HTMLInputElement} */ (inputs[inputs.length - 1])?.focus();
  });
  body.appendChild(add);

  if (status) {
    const s = document.createElement('div');
    s.className = `assets-status${status === 'not-saved' ? ' bad' : ''}`;
    s.textContent = status === 'saved' ? t('saved') : t('orgsNotSaved');
    body.appendChild(s);
  }
}

export function initOrgsPage() {
  onRefresh(renderOrgsPage);
}
