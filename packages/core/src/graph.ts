import type { Dependency } from './types';

/** An edge A → B means B requires A. Provenance relations never gate execution. */
export function findCycle(edges: Pick<Dependency, 'from' | 'to' | 'type'>[], from: string, to: string): string[] | null {
  if (from === to) return [from, to];
  const adjacency = new Map<string, string[]>();
  for (const edge of edges.filter(e => e.type === 'depends_on')) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  }
  const visit = (node: string, path: string[], seen: Set<string>): string[] | null => {
    if (node === from) return [from, ...path];
    if (seen.has(node)) return null;
    seen.add(node);
    for (const next of adjacency.get(node) ?? []) {
      const found = visit(next, [...path, next], seen);
      if (found) return found;
    }
    return null;
  };
  return visit(to, [to], new Set());
}

/** Stable topological ranks; ties follow the original node order. */
export function topologicalLayers(ids: string[], edges: Pick<Dependency, 'from' | 'to' | 'type'>[]): string[][] {
  const remaining = new Set(ids);
  const layers: string[][] = [];
  while (remaining.size) {
    const layer = ids.filter(id => remaining.has(id) && !edges.some(e => e.type === 'depends_on' && e.to === id && remaining.has(e.from)));
    if (!layer.length) throw new Error('Dependency graph contains a cycle');
    layers.push(layer);
    layer.forEach(id => remaining.delete(id));
  }
  return layers;
}
