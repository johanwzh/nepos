import { describe, it, expect } from 'vitest';
import { hasFolderAccess } from '../../src/project/folder-access.js';

describe('hasFolderAccess', () => {
  it('is true when the browser offers the folder picker', () => {
    expect(hasFolderAccess({ showDirectoryPicker: () => {} })).toBe(true);
  });

  it('is false when the picker is missing (Firefox, Safari, phones)', () => {
    expect(hasFolderAccess({})).toBe(false);
    expect(hasFolderAccess({ showDirectoryPicker: undefined })).toBe(false);
  });

  it('is false for something that is not a function', () => {
    expect(hasFolderAccess({ showDirectoryPicker: true })).toBe(false);
  });

  it('is false without a window at all', () => {
    expect(hasFolderAccess(undefined)).toBe(false);
    expect(hasFolderAccess(null)).toBe(false);
  });

  it('looks at what the browser offers, never at its name', () => {
    // a browser that adds the API later just works, whatever it calls itself
    expect(hasFolderAccess({ navigator: { userAgent: 'Mozilla/5.0 Firefox/130.0' }, showDirectoryPicker: () => {} })).toBe(true);
    expect(hasFolderAccess({ navigator: { userAgent: 'Mozilla/5.0 Chrome/130.0' } })).toBe(false);
  });
});
