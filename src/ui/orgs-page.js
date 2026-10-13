// Organisations page (F3). IDs are full NeTEx IDs typed by the user (RUT:Authority:1); the role
// comes from the ID. orgs.json is written only when every ID is valid, and never when Nepos could
// not read the file in the first place.
//
// The rows are built once per showing (and on add/delete). Edits update the changed row's role,
// marking and message in place, so the field or button the user moves to next is never replaced
// under their cursor.
import { app } from './state.js';
import { $, onRefresh, currentPage, runAction } from './shell.js';
import { t } from '../i18n/strings.js';
import { validateOrgs, orgRole } from '../core/orgs.js';
import { writeOrgs } from '../project/orgs-store.js';
import { orgIssueMessage } from './messages.js';

/** @type {{ row: HTMLElement, role: HTMLElement, msg: HTMLElement }[]} */
let rowParts = [];

/** @param {string} id */
function roleLabel(id) {
  const role = orgRole(id);
  return role === 'authority' ? t('roleAuthority') : role === 'operator' ? t('roleOperator') : '—';
}

/** Show the save status line, or remove it when there is nothing to say. */
function showStatus() {
  const body = $('assets-body');
  let el = body.querySelector('.assets-status');
  if (!app.orgsStatus) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    body.appendChild(el);
  }
  el.className = `assets-status${app.orgsStatus === 'not-saved' ? ' bad' : ''}`;
  el.textContent = app.orgsStatus === 'saved' ? t('saved') : t('orgsNotSaved');
}

/** Update every row's role, marking and messages to match the current list. */
function showValidation() {
  const issues = validateOrgs(app.orgs);
  rowParts.forEach(({ row, role, msg }, index) => {
    const rowIssues = issues.filter((i) => i.index === index);
    row.classList.toggle('invalid', rowIssues.length > 0);
    role.textContent = roleLabel(app.orgs[index].id);
    msg.textContent = rowIssues.map((i) => orgIssueMessage(i.code)).join(' · ');
    msg.hidden = rowIssues.length === 0;
  });
  return issues;
}

async function saveIfValid() {
  if (!app.fs || app.orgsError) return;
  if (showValidation().length > 0) {
    app.orgsStatus = 'not-saved';
  } else {
    const fs = app.fs;
    const saved = await runAction(() => writeOrgs(fs, app.orgs));
    app.orgsStatus = saved ? 'saved' : 'not-saved';
  }
  showStatus();
}

export function renderOrgsPage() {
  if (currentPage() !== 'assets') return;
  const body = $('assets-body');
  body.innerHTML = '';
  rowParts = [];
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
  for (const [text, style] of [[t('orgId'), 'width:228px'], [t('orgRole'), 'width:80px'], [t('orgName'), 'flex:1']]) {
    const span = document.createElement('span');
    span.setAttribute('style', style);
    span.textContent = text;
    hdr.appendChild(span);
  }
  body.appendChild(hdr);

  app.orgs.forEach((org, index) => {
    const row = document.createElement('div');
    row.className = 'asset-row';

    const idIn = document.createElement('input');
    idIn.className = 'asset-id-in';
    idIn.value = org.id;
    idIn.placeholder = 'ABC:Operator:1';
    idIn.addEventListener('change', () => { org.id = idIn.value; saveIfValid(); });

    const role = document.createElement('span');
    role.className = 'asset-role';

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
      renderOrgsPage();
      saveIfValid();
    });

    for (const el of [idIn, nameIn]) el.addEventListener('keydown', (e) => e.stopPropagation());
    row.append(idIn, role, nameIn, del);

    const msg = document.createElement('div');
    msg.className = 'asset-msg';
    body.append(row, msg);
    rowParts.push({ row, role, msg });
  });

  const add = document.createElement('button');
  add.className = 'asset-add';
  add.textContent = t('addOrg');
  add.addEventListener('click', () => {
    app.orgs.push({ id: '', name: '' });
    app.orgsStatus = 'not-saved';
    renderOrgsPage();
    const inputs = body.querySelectorAll('.asset-id-in');
    /** @type {HTMLInputElement} */ (inputs[inputs.length - 1])?.focus();
  });
  body.appendChild(add);

  showValidation();
  showStatus();
}

export function initOrgsPage() {
  onRefresh(renderOrgsPage);
}
