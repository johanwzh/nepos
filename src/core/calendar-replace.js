// "Replace calendar in all periods" (timetable structure spec §3): the season-switch bulk edit.

/**
 * @param {string} text ERN route file
 * @param {string} oldId @param {string} newId
 * @returns {{ text: string, changed: number }}
 */
export function replaceCalendarInErn(text, oldId, newId) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  /** @type {string[]} */ const out = [];
  let changed = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('#KAL;')) { out.push(lines[i]); continue; }
    let j = i;
    /** @type {string[]} */ const run = [];
    while (j < lines.length && lines[j].trim().startsWith('#KAL;')) run.push(lines[j++].trim().slice(5));
    i = j - 1;
    if (run.includes(oldId)) {
      changed++;
      const ids = [...new Set(run.map((id) => (id === oldId ? newId : id)))];
      for (const id of ids) out.push(`#KAL;${id}`);
    } else for (const id of run) out.push(`#KAL;${id}`);
  }
  return { text: out.join(nl), changed };
}

/** @param {any} rs @param {string} oldId @param {string} newId @returns {number} */
export function replaceCalendarInState(rs, oldId, newId) {
  let changed = 0;
  for (const per of rs.periods) {
    if (!per.calendarIds.includes(oldId)) continue;
    changed++;
    per.calendarIds = [...new Set(per.calendarIds.map((/** @type {string} */ id) => (id === oldId ? newId : id)))];
  }
  return changed;
}
