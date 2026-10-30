import { describe, it, expect } from 'vitest';
import { createHeap } from '../../src/routing/heap.js';

describe('the heap', () => {
  it('pops the smallest first', () => {
    const h = createHeap(4);
    for (const [id, p] of [[1, 5], [2, 1], [3, 9], [4, 3], [5, 2]]) h.push(id, p);
    const order = [];
    while (h.size()) order.push(h.pop());
    expect(order).toEqual([2, 5, 4, 1, 3]);
  });

  it('grows past its capacity, keeps duplicates, and can be cleared', () => {
    const h = createHeap(2);
    for (let i = 0; i < 100; i++) h.push(i, 100 - i);
    h.push(7, 0.5);
    expect(h.size()).toBe(101);
    expect(h.peekPriority()).toBe(0.5);
    expect(h.pop()).toBe(7);
    expect(h.pop()).toBe(99);
    h.clear();
    expect(h.size()).toBe(0);
  });
});
