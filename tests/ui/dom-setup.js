// Loads the app's real page markup (index.html) into the jsdom document, so UI modules can be
// tested against the same elements they use in the browser. jsdom lacks a few browser features
// the app touches; minimal stand-ins are installed here.
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '');

export function loadAppMarkup() {
  document.body.innerHTML = body;
  const proto = /** @type {any} */ (window.HTMLDialogElement?.prototype ?? HTMLElement.prototype);
  proto.showModal = function showModal() { this.open = true; };
  proto.close = function close() { this.open = false; };
  /** @type {any} */ (window).matchMedia = () => ({ matches: false, addEventListener() {} });
  // Tests never call Entur (spec §10): any network use fails loudly instead.
  /** @type {any} */ (globalThis).fetch = async () => { throw new Error('Network access is disabled in tests'); };
}

/** Let pending promise callbacks (file writes) finish. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
