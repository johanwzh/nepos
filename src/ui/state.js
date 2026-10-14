// The running app's shared state. UI modules read and change it, then call refreshAll().
import { DEFAULT_SETTINGS } from '../project/settings.js';

export const app = {
  /** @type {import('../project/fs.js').ProjectFs | null} the open project folder */
  fs: null,
  /** @type {any} the folder handle, when opened from disk */
  handle: null,
  /** @type {any} remembered handle from last session, offered as "Reopen" */
  lastHandle: null,
  /** @type {{ formatVersion: number, name: string, codespace: string, orgExportMode?: string } | null} */
  meta: null,
  /** @type {Record<string, any>} */
  settings: { ...DEFAULT_SETTINGS },
  /** @type {import('../core/orgs.js').Company[]} the project's copy of the organisations in use */
  orgs: [],
  /** @type {null | 'unreadable'} */
  orgsError: null,
  /** @type {import('../project/brandings-store.js').Branding[]} the project's brandings */
  brandings: [],
  /** @type {null | 'unreadable'} */
  brandingsError: null,
  /** @type {import('../core/calendars.js').Calendar[]} the project's calendars */
  calendars: [],
  /** @type {null | 'unreadable'} */
  calendarsError: null,
  /** @type {{ companies: import('../core/orgs.js').Company[], fetchedAt: string } | null} Entur's register (browser cache) */
  orgRegister: null,
  /** @type {'idle' | 'loading' | 'ok' | 'failed'} */
  orgRegisterStatus: 'idle',
  /** @type {{ changed: string[], missing: string[] }} found by the last register refresh */
  orgChanges: { changed: [], missing: [] },
  /** @type {'orgs' | 'brandings'} the section shown on Ressurser */
  assetsSection: 'orgs',
  /** @type {import('../project/open.js').RouteEntry[]} */
  routes: [],
  /** @type {{ fileName: string, problem: string, rename: string | null }[]} */
  fileNameProblems: [],
  /** @type {string | null} code of the selected route */
  activeRoute: null,
  /** @type {any} the open route's state (from parseERN), or null */
  routeState: null,
  dirty: false,
  sampleMode: false,
};
