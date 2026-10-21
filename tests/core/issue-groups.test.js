// Problems grouped by kind (user 2026-10-21): one line per kind per line, with a count, instead of one per issue.
import { describe, it, expect } from 'vitest';
import { groupIssues } from '../../src/core/issue-groups.js';

/** @param {'error' | 'warning'} level @param {string} code @param {string} [route] @param {string} [detail] */
const i = (level, code, route, detail) => ({ level, code, route, detail });

describe('groupIssues', () => {
  it('puts the same kind on the same line together, with a count', () => {
    const g = groupIssues([i('error', 'dest-missing', '34'), i('error', 'dest-missing', '34'), i('error', 'speed-over', '34', 'A–B'), i('error', 'dest-missing', '35')]);
    expect(g.map((x) => [x.route, x.code, x.count])).toEqual([['34', 'dest-missing', 2], ['34', 'speed-over', 1], ['35', 'dest-missing', 1]]);
    expect(g[0].issues).toHaveLength(2);
  });

  it('lists errors before warnings, and the biggest groups first within a line', () => {
    const g = groupIssues([i('warning', 'dest-unserved', '34'), i('error', 'speed-over', '34'), i('error', 'dest-missing', '34'), i('error', 'dest-missing', '34')]);
    expect(g.map((x) => `${x.level}:${x.code}`)).toEqual(['error:dest-missing', 'error:speed-over', 'warning:dest-unserved']);
  });

  it('keeps project-wide issues (no line) as their own groups', () => {
    const g = groupIssues([i('warning', 'org-register-missing'), i('error', 'dest-missing', '34')]);
    expect(g.map((x) => [x.route ?? null, x.code])).toEqual([['34', 'dest-missing'], [null, 'org-register-missing']]);
  });
});
