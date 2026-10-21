// Problems grouped by kind (user 2026-10-21): "20 trips without a destination on line 34" instead of 20 lines, on the
// Oversikt page and the export page, so hundreds of columns do not bury the rest.

/**
 * @typedef {import('./export-check.js').CheckIssue} CheckIssue
 * @typedef {{ level: 'error' | 'warning', code: string, route: string | undefined, count: number, issues: CheckIssue[] }} IssueGroup
 */

/**
 * One group per line, level and kind. Lines keep the order they first appear in, project-wide issues (no line) come
 * last; within a line errors come first, then the biggest groups.
 * @param {CheckIssue[]} issues
 * @returns {IssueGroup[]}
 */
export function groupIssues(issues) {
  /** @type {Map<string, IssueGroup & { first: number }>} */
  const groups = new Map();
  /** @type {Map<string, number>} line → the order it first appears in */
  const lineOrder = new Map();
  issues.forEach((issue, n) => {
    const line = issue.route ?? '';
    if (!lineOrder.has(line)) lineOrder.set(line, line ? n : Number.MAX_SAFE_INTEGER);
    const key = `${line}|${issue.level}|${issue.code}`;
    const g = groups.get(key);
    if (g) { g.count++; g.issues.push(issue); } else groups.set(key, { level: issue.level, code: issue.code, route: issue.route, count: 1, issues: [issue], first: n });
  });
  return [...groups.values()]
    .sort((a, b) => (lineOrder.get(a.route ?? '') ?? 0) - (lineOrder.get(b.route ?? '') ?? 0)
      || (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1)
      || b.count - a.count || a.first - b.first)
    .map(({ first: _first, ...g }) => g);
}
