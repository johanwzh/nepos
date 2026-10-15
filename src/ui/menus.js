// The application menus (navigation spec §6): Prosjekt, Linjer and Visning.
import { app } from './state.js';
import { $, refreshAll, runAction, persistSettings, applyTheme, onRefresh, openProjectSettings, currentPage, setPage } from './shell.js';
import { t } from '../i18n/strings.js';
import { createMenuBar } from './menubar.js';
import { pickAndOpen, openNewDialog, openRecent, closeProject, copyProject, setOnRecentChanged, openCodespaceDialog } from './project-ui.js';
import { newRoute, saveRoute, saveAllRoutes, discardAllChanges } from './route-editor.js';
import { newDraft as newCalendarDraft, saveOpenCalendar } from './calendars-page.js';
import { unsavedCalendarCount, saveAllCalendars } from './calendar-drafts.js';
import { unsavedCodes } from './drafts.js';
import { loadRecentFolders, clearRecentFolders } from './recent-folders.js';
import { loadColourTheme, saveColourTheme, applyColourTheme, openThemeDialog } from './theme.js';
import { showShortcuts, showUserGuide, showVersionHistory, showContact, showGitHub } from './help.js';

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
    { label: t('copyProject'), disabled: !app.meta || app.sampleMode, action: () => { void copyProject(); } },
    { label: t('csMenu'), disabled: !app.meta || app.sampleMode, action: openCodespaceDialog },
    'separator',
    { label: t('closeProject'), disabled: !app.meta, action: () => { void closeProject(); } },
  ] },
  // Rediger: making and saving lines and calendars (the two lists have "+ Ny" buttons too).
  { label: () => t('menuEdit'), items: () => {
    const onCalendars = currentPage() === 'calendars';
    const canSave = onCalendars ? !!app.calendarSelected && app.calendarDrafts.has(app.calendarSelected) : !!app.activeRoute && app.dirty;
    const unsaved = unsavedCodes().length + unsavedCalendarCount();
    return [
      { label: t('newLine'), disabled: !app.meta, action: () => { void newRoute().then(() => setPage('edit')); } },
      { label: t('newCalendar'), disabled: !app.meta, action: () => { setPage('calendars'); newCalendarDraft(); } },
      'separator',
      { label: t('saveCurrent'), hint: 'Ctrl+S', disabled: !canSave, action: () => { if (onCalendars) saveOpenCalendar(); else void saveRoute(); } },
      { label: t('saveAllChanges'), disabled: !unsaved, action: () => { void saveAllRoutes().then((ok) => (ok ? saveAllCalendars() : false)).then(() => refreshAll()); } },
      { label: t('discardAll'), disabled: !unsaved, action: discardAllChanges },
    ];
  } },
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
  { label: () => t('menuHelp'), items: () => [
    { label: t('helpShortcuts'), action: showShortcuts },
    { label: t('helpGuide'), action: showUserGuide },
    { label: t('helpVersions'), action: showVersionHistory },
    'separator',
    { label: t('helpContact'), action: showContact },
    { label: 'GitHub', action: showGitHub },
  ] },
];

export function initMenus() {
  const relabel = createMenuBar($('menubar'), MENUS);
  onRefresh(relabel); // menu names follow the language
  setOnRecentChanged(reloadRecent); // a folder opened or forgotten shows at once
  void reloadRecent();
}

export { MENUS };
