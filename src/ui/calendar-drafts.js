// Unsaved calendar edits (calendars page spec §4): kept in app.calendarDrafts until saved, so lines,
// the timeline and the export use the saved calendars meanwhile. Leaving the project asks about
// these as it does about unsaved lines.
import { app } from './state.js';
import { runAction } from './shell.js';
import { writeCalendars } from '../project/calendars-store.js';

export const unsavedCalendarCount = () => app.calendarDrafts.size;

/** Save every calendar with a name; unnamed new ones are dropped. @returns {Promise<boolean>} */
export async function saveAllCalendars() {
  const fs = app.fs;
  if (!app.calendarDrafts.size) return true;
  if (!fs || app.calendarsError) return false;
  const drafts = [...app.calendarDrafts.values()].filter((d) => d.name.trim());
  const next = [...app.calendars.map((c) => drafts.find((d) => d.id === c.id) ?? c), ...drafts.filter((d) => !app.calendars.some((c) => c.id === d.id))];
  const ok = await runAction(() => writeCalendars(fs, next.filter((c) => c.name.trim())));
  if (!ok) return false;
  app.calendars = next;
  app.calendarDrafts.clear();
  return true;
}
