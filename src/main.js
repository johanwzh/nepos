import { VERSION } from './version.js';

// Placeholder shell. The real UI is built in Plan 2.
const app = document.getElementById('app');
if (app) app.textContent = `Nepos ${VERSION}`;
