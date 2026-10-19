// The routing Web Worker: all tile fetching, decoding, graph building and searching happens here, never on the
// page's own thread (the grid must stay fast). Only results go back.
import { createWorkerHandler } from './worker-core.js';

const handle = createWorkerHandler((msg) => self.postMessage(msg));
self.onmessage = (ev) => { void handle(ev.data); };
