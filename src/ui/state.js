// The running app's shared state. UI modules read and change it, then call refreshAll().
import { DEFAULT_SETTINGS } from '../project/settings.js';

export const app = {
  /** @type {import('../project/fs.js').ProjectFs | null} the open project folder */
  fs: null,
  /** @type {any} the folder handle, when opened from disk */
  handle: null,
  /** @type {any} remembered handle from last session, offered as "Reopen" */
  lastHandle: null,
  /** @type {{ formatVersion: number, name: string, codespace: string } | null} */
  meta: null,
  /** @type {Record<string, any>} */
  settings: { ...DEFAULT_SETTINGS },
  /** @type {{ id: string, name: string }[]} */
  orgs: [],
  /** @type {null | 'unreadable'} */
  orgsError: null,
  /** @type {import('../project/open.js').RouteEntry[]} */
  routes: [],
  /** @type {{ fileName: string, problem: string, rename: string | null }[]} */
  fileNameProblems: [],
  /** @type {string | null} code of the selected route */
  activeRoute: null,
  dirty: false,
  sampleMode: false,
};
