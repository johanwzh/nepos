// Whether this browser can open and save a project folder (the File System Access API).
// Chrome and Edge on a desktop computer can; Firefox, Safari and phone browsers cannot.

/**
 * Feature detection, never the browser's name: a browser that adds the API later just works.
 * @param {any} [win] the window to look at (the real one unless a test passes another)
 * @returns {boolean}
 */
export function hasFolderAccess(win = typeof window === 'undefined' ? undefined : window) {
  return typeof win?.showDirectoryPicker === 'function';
}
