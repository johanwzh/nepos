// Turns the codes from the core and project layers into sentences.
import { t } from '../i18n/strings.js';

/** @param {import('../core/integrity/check.js').IntegrityIssue} issue */
export function issueMessage(issue) {
  const text = t(`issue:${issue.code}`, issue.detail ?? '');
  return issue.line ? `${t('lineLabel', issue.line)}: ${text}` : text;
}

/** @param {{ ok: number, outdated: number, damaged: number }} summary */
export function summaryMessage({ ok, outdated, damaged }) {
  return t('integritySummary', ok, outdated, damaged);
}

/** @param {{ fileName: string, problem: string, rename: string | null }} p */
export function fileNameMessage(p) {
  return `${p.fileName}: ${t(`name:${p.problem}`)} — ${p.rename ? t('renameTo', p.rename) : t('noAutoRepair')}`;
}

/** @param {{ reason: string, formatVersion?: number } & Record<string, any>} result */
export function openFailureMessage(result) {
  return t(`open:${result.reason}`, result.formatVersion);
}

/** @param {{ error: string, found?: string[] } & Record<string, any>} result */
export function createFailureMessage(result) {
  return t(`create:${result.error}`, (result.found ?? []).join(', '));
}

/** @param {string} code */
export function orgIssueMessage(code) {
  return t(`org:${code}`);
}
