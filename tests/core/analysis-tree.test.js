// Analyse (spec 2026-10-31): the tree project → authority → operator; every node gets the same receipt.
import { describe, it, expect } from 'vitest';
import { analysisTree, findNode } from '../../src/core/analysis/tree.js';

const row = (/** @type {string} */ code, /** @type {string} */ authorityId, /** @type {string} */ authority, /** @type {string} */ operatorId, /** @type {string} */ operator) => ({ code, authorityId, authority, operatorId, operator });
const OPTS = { projectName: 'Hele prosjektet', unknownAuthority: 'Ukjent oppdragsgiver', unknownOperator: 'Ukjent operatør' };

describe('the analysis tree', () => {
  it('authorities hold their operators; an operator under two authorities appears under each; Ukjent last and only when used', () => {
    const tree = analysisTree([
      row('1', 'A:Authority:2', 'Østfold', 'O:Operator:1', 'Vy Buss'),
      row('2', 'A:Authority:1', 'Innlandet', 'O:Operator:1', 'Vy Buss'),
      row('3', 'A:Authority:1', 'Innlandet', 'O:Operator:2', 'Boreal'),
      row('4', 'A:Authority:1', 'Innlandet', '', ''),
      row('5', '', '', 'O:Operator:2', 'Boreal'),
    ], OPTS);
    expect(tree).toMatchObject({ id: 'project', kind: 'project', name: 'Hele prosjektet', lines: ['1', '2', '3', '4', '5'] });
    expect(tree.children.map((c) => [c.id, c.name, c.lines])).toEqual([
      ['authority:A:Authority:1', 'Innlandet', ['2', '3', '4']],
      ['authority:A:Authority:2', 'Østfold', ['1']],
      ['authority:', 'Ukjent oppdragsgiver', ['5']],
    ]);
    const inn = tree.children[0];
    expect(inn.children.map((c) => [c.id, c.name, c.unknown, c.lines])).toEqual([
      ['authority:A:Authority:1/operator:O:Operator:2', 'Boreal', false, ['3']],
      ['authority:A:Authority:1/operator:O:Operator:1', 'Vy Buss', false, ['2']],
      ['authority:A:Authority:1/operator:', 'Ukjent operatør', true, ['4']],
    ]);
    expect(tree.children[1].children.map((c) => c.id)).toEqual(['authority:A:Authority:2/operator:O:Operator:1']);
    expect(tree.children[2].unknown).toBe(true);
    expect(findNode(tree, 'authority:A:Authority:1/operator:O:Operator:1')?.lines).toEqual(['2']);
    expect(findNode(tree, 'nope')).toBeNull();
  });

  it('no Ukjent nodes when every line has an authority and an operator', () => {
    const tree = analysisTree([row('1', 'A:Authority:1', 'Innlandet', 'O:Operator:1', 'Vy')], OPTS);
    expect(tree.children.map((c) => c.id)).toEqual(['authority:A:Authority:1']);
    expect(tree.children[0].children.map((c) => c.id)).toEqual(['authority:A:Authority:1/operator:O:Operator:1']);
  });
});
