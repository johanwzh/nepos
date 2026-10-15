// The application menus (navigation spec §6): Prosjekt, Linjer and Visning.
import { app } from './state.js';
import { $, refreshAll, runAction, persistSettings, applyTheme, onRefresh, openProjectSettings } from './shell.js';
import { t } from '../i18n/strings.js';
import { createMenuBar } from './menubar.js';
import { pickAndOpen, openNewDialog, openRecent, closeProject, copyProject, setOnRecentChanged } from './project-ui.js';
import { newRoute, saveRoute, saveAllRoutes, discardAllChanges } from './route-editor.js';
import { unsavedCodes } from './drafts.js';
import { loadRecentFolders, clearRecentFolders } from './recent-folders.js';
import { loadColourTheme, saveColourTheme, applyColourTheme, openThemeDialog } from './theme.js';

/** @type {{ name: string, handle: any }[]} */
let recent = [];
export async function reloadRecent() { recent = await loadRecentFolders(); }

/** @param {string} lang */
function setLanguage(lang) {
  app.settings.lang = lang;
  refreshAll();
  runAction(persistSettings);
}

/** @param {string} theme */
function setLightDark(theme) {
  app.settings.theme = theme;
  applyTheme();
  runAction(persistSettings);
}

/** @type {import('./menubar.js').Menu[]} */
const MENUS = [
  { label: () => t('menuProject'), items: () => [
    { label: t('newProjectItem'), action: () => { void openNewDialog(); } },
    { label: t('openProjectItem'), action: () => { void pickAndOpen(); } },
    { label: t('openRecent'), submenu: () => (recent.length
      ? [...recent.map((f) => /** @type {import('./menubar.js').MenuItem} */ ({ label: f.name, action: () => { void openRecent(f.handle); } })),
        'separator', { label: t('recentClear'), action: () => { void clearRecentFolders().then(reloadRecent); } }]
      : [{ label: t('recentNone'), disabled: true }]) },
    'separator',
    { label: t('projectSettings') + '…', disabled: !app.meta, action: openProjectSettings },
    'separator',
    { label: t('closeProject'), disabled: !app.meta, action: () => { void closeProject(); } },
    { label: t('copyProject'), disabled: !app.meta || app.sampleMode, action: () => { void copyProject(); } },
  ] },
  { label: () => t('menuLines'), items: () => [
    { label: t('newLine'), disabled: !app.meta, action: () => { void newRoute(); } },
    'separator',
    { label: t('saveLine'), hint: 'Ctrl+S', disabled: !app.activeRoute || !app.dirty, action: () => { void saveRoute(); } },
    { label: t('saveAllLines'), disabled: !unsavedCodes().length, action: () => { void saveAllRoutes(); } },
    { label: t('discardAll'), disabled: !unsavedCodes().length, action: discardAllChanges },
  ] },
  { label: () => t('menuView'), items: () => [
    { label: t('language'), submenu: () => [
      { label: 'Norsk', checked: app.settings.lang === 'no', action: () => setLanguage('no') },
      { label: 'English', checked: app.settings.lang === 'en', action: () => setLanguage('en') },
    ] },
    { label: t('lightDark'), submenu: () => [
      { label: t('themeLight'), checked: app.settings.theme === 'light', action: () => setLightDark('light') },
      { label: t('themeDark'), checked: app.settings.theme === 'dark', action: () => setLightDark('dark') },
      { label: t('themeSystem'), checked: app.settings.theme === 'system', action: () => setLightDark('system') },
    ] },
    { label: t('colourTheme'), submenu: () => [
      { label: 'Nepos', checked: !loadColourTheme(), action: () => { saveColourTheme(null); applyColourTheme(); } },
      { label: t('themeCustom'), checked: !!loadColourTheme(), action: openThemeDialog },
    ] },
  ] },
];

export function initMenus() {
  const relabel = createMenuBar($('menubar'), MENUS);
  onRefresh(relabel); // menu names follow the language
  setOnRecentChanged(reloadRecent); // a folder opened or forgotten shows at once
  void reloadRecent();
}

export { MENUS };
