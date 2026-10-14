// Ressurser: switching between its sections (organisations, brandings).
import { app } from './state.js';
import { refreshAll } from './shell.js';

export function initAssetsNav() {
  for (const item of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.assets-nav-item[data-sec]'))) {
    item.addEventListener('click', () => {
      app.assetsSection = /** @type {'orgs' | 'brandings'} */ (item.dataset.sec);
      for (const other of document.querySelectorAll('.assets-nav-item')) other.classList.toggle('active', other === item);
      refreshAll();
    });
  }
}
