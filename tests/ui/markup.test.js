import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const body = html.slice(html.indexOf('<body>'), html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');

describe('the app page markup', () => {
  it('holds no stray plan text or markdown', () => {
    expect(body).not.toMatch(/\*\*Files:\*\*|\*\*Interfaces:\*\*|```|- \[ \]/);
  });

  it('has each dialog exactly once', () => {
    for (const id of ['ts-dlg', 'cal-replace-dlg', 'check-dlg', 'msg-dlg']) {
      expect(body.match(new RegExp(`<dialog[^>]*id="${id}"`, 'g')), id).toHaveLength(1);
    }
  });
});
