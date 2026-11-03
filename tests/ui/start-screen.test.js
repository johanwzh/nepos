// @vitest-environment jsdom
// The start screen (the Editor page with no project open), and the tabs that stay locked until a project is open.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage, currentPage, refreshAll } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs, closeProject, pickAndOpen } from '../../src/ui/project-ui.js';
import { initMenus } from '../../src/ui/menus.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';

const byId = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const tabs = () => /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.tab[data-page]')]);
const tab = (/** @type {string} */ page) => /** @type {HTMLElement} */ (tabs().find((t) => t.dataset.page === page));
const key = (/** @type {string} */ k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, altKey: true, bubbles: true, cancelable: true }));
const openMenu = (/** @type {number} */ i) => /** @type {HTMLElement} */ (document.querySelector(`.mb-menu[data-menu="${i}"]`)).click();
const item = (/** @type {string} */ label) => /** @type {HTMLElement} */ ([...document.querySelectorAll('.mb-item')].find((e) => e.querySelector('.mb-label')?.textContent === label));
const win = /** @type {any} */ (window);

/** jsdom has no folder picker, like Firefox: a test that wants one adds it. */
const withFolderAccess = () => { win.showDirectoryPicker = vi.fn(); refreshAll(); };

beforeEach(async () => {
  delete win.showDirectoryPicker;
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); // closes a menu the last test left open
  loadAppMarkup();
  initShell();
  setPage('edit');
  initRouteList();
  await initProjectUi({ restoreLast: false });
  initMenus();
  app.settings.lang = 'en';
  refreshAll();
});

describe('start screen in a browser without folder access', () => {
  it('says calmly what Nepos needs, and offers no buttons', () => {
    expect(byId('grid-ph-h').textContent).toBe('Nepos needs a different browser');
    expect(byId('grid-ph-s').textContent).toContain('this browser does not let web pages open folders');
    expect(byId('grid-ph-s').textContent).toContain('Chrome or Edge on a desktop computer (Windows, Mac or Linux)');
    expect(byId('grid-ph-s').textContent).toContain('Other Chromium browsers may work too');
    expect(byId('grid-ph-actions').children).toHaveLength(0);
    expect(byId('grid-ph').classList.contains('n2-ph-notice')).toBe(true); // drawn with readable colours
  });

  it('says the same in Norwegian', () => {
    app.settings.lang = 'no';
    refreshAll();
    expect(byId('grid-ph-h').textContent).toBe('Nepos trenger en annen nettleser');
    expect(byId('grid-ph-s').textContent).toContain('lar ikke nettsider åpne mapper');
    expect(byId('grid-ph-s').textContent).toContain('Chrome eller Edge på en datamaskin med Windows, Mac eller Linux');
    expect(byId('grid-ph-actions').children).toHaveLength(0);
  });

  it('leaves the line list without a hint to open a folder, which this browser cannot do', () => {
    expect(byId('route-list').textContent).toBe('');
  });

  it('greys out New project and Open project', () => {
    openMenu(0);
    expect(item('New project…').classList.contains('disabled')).toBe(true);
    expect(item('Open project…').classList.contains('disabled')).toBe(true);
  });

  it('answers a stray call to the folder picker with the explanation, not an error', async () => {
    await pickAndOpen();
    expect(byId('msg-dlg').hasAttribute('open')).toBe(true);
    expect(byId('msg-text').textContent).toContain('Chrome or Edge');
    expect(byId('msg-text').textContent).not.toContain('not a function');
  });
});

describe('start screen in a browser with folder access', () => {
  beforeEach(() => withFolderAccess());

  it('offers to open or create a project, and does not explain anything', () => {
    expect(byId('grid-ph-h').textContent).toBe('Nepos');
    expect(byId('grid-ph-s').textContent).toBe('Open a project folder, or create a new one, to get started');
    expect([...byId('grid-ph-actions').children].map((b) => b.textContent)).toEqual(['Open project…', 'New project…']);
    expect(byId('route-list').textContent).toContain('Open a project folder');
    expect(byId('grid-ph').classList.contains('n2-ph-notice')).toBe(false);
  });

  it('keeps New project and Open project in the menu', () => {
    openMenu(0);
    expect(item('New project…').classList.contains('disabled')).toBe(false);
    expect(item('Open project…').classList.contains('disabled')).toBe(false);
  });
});

describe('tabs without a project', () => {
  beforeEach(() => withFolderAccess());

  it('are locked, except the Editor, which holds the start screen', () => {
    expect(tabs().filter((t) => t.classList.contains('locked')).map((t) => t.dataset.page))
      .toEqual(['tasks', 'lines', 'calendars', 'assets', 'export', 'home']);
    expect(tab('edit').classList.contains('locked')).toBe(false);
    expect(tab('edit').classList.contains('active')).toBe(true);
    expect(tab('tasks').getAttribute('aria-disabled')).toBe('true');
  });

  it('stay on the start screen when clicked', () => {
    for (const t of tabs()) t.click();
    expect(currentPage()).toBe('edit');
    expect(byId('page-edit').classList.contains('active')).toBe(true);
  });

  it('stay on the start screen on Alt+1…7', () => {
    for (const k of '1234567') key(k);
    expect(currentPage()).toBe('edit');
  });

  it('stay locked in a browser without folder access too', () => {
    delete win.showDirectoryPicker;
    refreshAll();
    tab('lines').click();
    key('3');
    expect(currentPage()).toBe('edit');
    expect(tab('lines').classList.contains('locked')).toBe(true);
  });

  it('unlock when a project opens, and lock again, back on the start screen, when it closes', async () => {
    const fs = createMemoryFs();
    await createProject(fs, { name: 'Test', codespace: 'TST' });
    await openFs(fs, { landing: true });
    /** @type {any} */ (byId('check-dlg')).close();
    expect(tabs().some((t) => t.classList.contains('locked'))).toBe(false);
    expect(tab('tasks').hasAttribute('aria-disabled')).toBe(false);
    expect(currentPage()).toBe('tasks');
    key('3');
    expect(currentPage()).toBe('lines');
    tab('export').click();
    expect(currentPage()).toBe('export');

    win.confirm = vi.fn(() => true);
    await closeProject();
    await flush();
    expect(app.meta).toBe(null);
    expect(currentPage()).toBe('edit');
    expect(tab('export').classList.contains('locked')).toBe(true);
    key('1');
    expect(currentPage()).toBe('edit');
  });

  it('keep the panel button on the start screen from jumping to the lines page', () => {
    byId('close-left').click();
    expect(currentPage()).toBe('edit');
  });
});
