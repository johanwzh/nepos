// The running app's shared state. UI modules read and change it, then call refreshAll().
import { DEFAULT_SETTINGS } from '../project/settings.js';

export const app = {
  /** @type {import('../project/fs.js').ProjectFs | null} the open project folder */
  fs: null,
  /** @type {any} the folder handle, when opened from disk */
  handle: null,
  /** @type {any} remembered handle from last session, offered as "Reopen" */
  lastHandle: null,
  /** @type {{ formatVersion: number, name: string, codespace: string, orgExportMode?: string, speedLimits?: Record<string, number> } | null} */
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
  /** @type {import('../project/labels-store.js').Label[]} the project's column labels (62) */
  labels: [],
  /** @type {null | 'unreadable'} */
  labelsError: null,
  /** @type {(import('../project/labels-store.js').Label & Partial<import('../core/vehicles.js').Vehicle>)[]} the project's vehicles (user 2026-10-20), kept like the labels; older ones may lack the vehicle fields */
  vehicles: [],
  /** @type {null | 'unreadable'} */
  vehiclesError: null,
  /** @type {Map<string, import('../core/link-state.js').SavedShape>} routed links, by fromQuay|toQuay|profile (2.3) */
  shapes: new Map(),
  /** @type {'' | 'unreadable'} */
  shapesError: '',
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
  /** @type {string | null} the calendar shown in the calendar editor */
  calendarSelected: null,
  /** @type {number} (unused since the run of months; kept for old state) */
  calendarYear: 0,
  /** @type {string} the first month shown in the calendar editor, YYYYMM ('' = from the calendar) */
  calendarMonth: '',
  /** @type {Map<string, import('../core/calendars.js').Calendar>} unsaved calendar edits */
  calendarDrafts: new Map(),
  /** @type {string | null} Linjer shows only the lines using this calendar */
  linesFilterCal: null,
  /** @type {string | null} the resource open in its editor on Ressurser (b:… a merkevare, o:… an organisation) */
  resourceSelected: null,
  /** @type {Map<string, any>} unsaved resource edits: a merkevare, or an organisation's aliases by NOG ID */
  resourceDrafts: new Map(),
  /** @type {import('../project/open.js').RouteEntry[]} */
  routes: [],
  /** @type {{ fileName: string, problem: string, rename: string | null }[]} */
  fileNameProblems: [],
  /** @type {string | null} code of the selected route */
  activeRoute: null,
  /** @type {any} the open route's state (from parseERN), or null */
  routeState: null,
  dirty: false,
  /** @type {Map<string, any>} unsaved route states of lines that are not open (navigation spec §2) */
  drafts: new Map(),
  sampleMode: false,
};
