// A binary min-heap of (id, priority), for the search. Duplicates are allowed (stale entries are skipped by the
// caller), so there is no decrease-key. Grows as needed.

/** @param {number} [capacity] */
export function createHeap(capacity = 1024) {
  let ids = new Int32Array(capacity), pri = new Float64Array(capacity), n = 0;
  return {
    size: () => n,
    clear() { n = 0; },
    /** @param {number} id @param {number} p */
    push(id, p) {
      if (n === ids.length) {
        const i2 = new Int32Array(n * 2), p2 = new Float64Array(n * 2);
        i2.set(ids); p2.set(pri); ids = i2; pri = p2;
      }
      let i = n++;
      while (i > 0) {
        const up = (i - 1) >> 1;
        if (pri[up] <= p) break;
        ids[i] = ids[up]; pri[i] = pri[up]; i = up;
      }
      ids[i] = id; pri[i] = p;
    },
    /** The smallest priority's id (the heap must not be empty). */
    pop() {
      const top = ids[0];
      const id = ids[--n], p = pri[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && pri[c + 1] < pri[c]) c++;
        if (pri[c] >= p) break;
        ids[i] = ids[c]; pri[i] = pri[c]; i = c;
      }
      ids[i] = id; pri[i] = p;
      return top;
    },
    /** The smallest priority (heap not empty). */
    peekPriority: () => pri[0],
  };
}
