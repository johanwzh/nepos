// The browser's own suggestions (earlier values typed in a field with the same name) get in the way
// in an editor: every field in Nepos turns them off when it gets focus, unless it asks for its own.

/** @param {Document} doc */
export function initNoAutofill(doc) {
  doc.addEventListener('focusin', (e) => {
    const el = e.target;
    if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !el.hasAttribute('autocomplete')) {
      el.setAttribute('autocomplete', 'off');
    }
  });
}
