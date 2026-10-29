// A line's export and public flags (#EKS, #OFF) set in a saved ERN text, nothing else changed (2.5, user
// 2026-10-29: the list switches are export settings, saved at once). A file without the records gets them where the
// serializer writes them: after #RUT, #TRM and #MRK. Only 0 means no.

const RECORD = /^#(EKS|OFF);/;
const HEAD = /^#(RUT|TRM|MRK);/;

/**
 * @param {string} text the saved ERN text
 * @param {{ exported?: boolean, isPublic?: boolean }} flags the flags to set
 * @returns {string}
 */
export function setLineFlags(text, flags) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(nl);
  const now = (/** @type {string} */ name) => lines.find((l) => l.startsWith(`#${name};`))?.split(';')[1]?.trim() !== '0';
  const eks = `#EKS;${(flags.exported ?? now('EKS')) ? 1 : 0}`;
  const off = `#OFF;${(flags.isPublic ?? now('OFF')) ? 1 : 0}`;
  const iEks = lines.findIndex((l) => l.startsWith('#EKS;'));
  const iOff = lines.findIndex((l) => l.startsWith('#OFF;'));
  if (iEks >= 0 && iOff >= 0) {
    lines[iEks] = eks;
    lines[iOff] = off;
    return lines.join(nl);
  }
  const rest = lines.filter((l) => !RECORD.test(l));
  let at = 0;
  for (let i = 0; i < rest.length && !rest[i].startsWith('#TRA'); i++) if (HEAD.test(rest[i])) at = i + 1;
  rest.splice(at, 0, eks, off);
  return rest.join(nl);
}
