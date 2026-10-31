// Analyse (spec 2026-10-31): the project → authority → operator tree. A line belongs to the first authority and the
// first operator in its line data, as the export writes them; one without goes under an Ukjent node, listed last and
// only when it has lines. An operator under two authorities is a node under each.

/** @typedef {{ id: string, kind: 'project' | 'authority' | 'operator', name: string, unknown: boolean, lines: string[], children: TreeNode[] }} TreeNode */

/** By name, Ukjent last. @param {TreeNode[]} nodes */
const sorted = (nodes) => nodes.sort((a, b) => Number(a.unknown) - Number(b.unknown) || a.name.localeCompare(b.name, 'nb'));

/**
 * @param {{ code: string, authorityId: string, authority: string, operatorId: string, operator: string }[]} rows the exported lines
 * @param {{ projectName: string, unknownAuthority: string, unknownOperator: string }} names
 * @returns {TreeNode}
 */
export function analysisTree(rows, { projectName, unknownAuthority, unknownOperator }) {
  /** @type {Map<string, TreeNode>} */
  const auths = new Map();
  for (const r of rows) {
    const aId = `authority:${r.authorityId}`;
    const a = auths.get(aId) ?? { id: aId, kind: /** @type {const} */ ('authority'), name: r.authorityId ? r.authority || r.authorityId : unknownAuthority, unknown: !r.authorityId, lines: [], children: [] };
    a.lines.push(r.code);
    auths.set(aId, a);
    const oId = `${aId}/operator:${r.operatorId}`;
    let o = a.children.find((c) => c.id === oId);
    if (!o) { o = { id: oId, kind: 'operator', name: r.operatorId ? r.operator || r.operatorId : unknownOperator, unknown: !r.operatorId, lines: [], children: [] }; a.children.push(o); }
    o.lines.push(r.code);
  }
  for (const a of auths.values()) sorted(a.children);
  return { id: 'project', kind: 'project', name: projectName, unknown: false, lines: rows.map((r) => r.code), children: sorted([...auths.values()]) };
}

/** @param {TreeNode} tree @param {string} id @returns {TreeNode | null} */
export function findNode(tree, id) {
  if (tree.id === id) return tree;
  for (const c of tree.children) { const hit = findNode(c, id); if (hit) return hit; }
  return null;
}
