// "Bytt codespace": a new codespace for the whole project. Every ID Nepos made with the codespace is
// rewritten — branding IDs (also where lines refer to them), typed organisation export IDs, and the
// codespace in each line file's #LEV. NOG IDs and UUIDs carry no codespace and stay. Pure: the
// caller reads and writes the files.

/**
 * @param {string} from old codespace
 * @param {string} to new codespace
 * @template {{ id: string }} B
 * @param {{ brandings: B[], orgs: import('./orgs.js').Company[], routes: { code: string, text: string }[] }} project
 */
export function recodeProject(from, to, { brandings, orgs, routes }) {
  const prefix = `${from}:`;
  /** @param {string} id */
  const swap = (id) => (id.startsWith(prefix) ? `${to}:${id.slice(prefix.length)}` : id);
  return {
    brandings: brandings.map((b) => ({ ...b, id: swap(b.id) })),
    orgs: orgs.map((c) => ({
      ...c,
      authority: c.authority ? withAlias(c.authority, swap) : null,
      operator: c.operator ? withAlias(c.operator, swap) : null,
    })),
    routes: routes.map(({ code, text }) => {
      const out = text.split(/(\r?\n)/).map((part) => {
        const f = part.split(';');
        if (f[0] === '#LEV' && f.length >= 3) { f[2] = to; return f.join(';'); }
        if (f[0] === '#BRA' && f.length >= 2) { f[1] = swap(f[1].trim()); return f.join(';'); }
        return part;
      }).join('');
      return { code, text: out, changed: out !== text };
    }),
  };
}

/**
 * @param {import('./orgs.js').OrgRoleEntry} entry
 * @param {(id: string) => string} swap
 */
function withAlias(entry, swap) {
  return entry.alias ? { ...entry, alias: swap(entry.alias) } : { ...entry };
}
