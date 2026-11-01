import type { NetworkNode, NetworkEdge, SerializedNetwork, ValidationResult, ValidationFinding } from './types';

export interface Graph {
  nodes: Map<string, NetworkNode>;
  edges: Map<string, NetworkEdge>;
  adjacency: Map<string, AdjEntry[]>;
  reverseAdjacency: Map<string, string[]>;
}

export interface AdjEntry {
  edgeId: string;
  to: string;
  edge: NetworkEdge;
}

export function buildGraph(network: SerializedNetwork): Graph {
  const nodes = new Map<string, NetworkNode>();
  const edges = new Map<string, NetworkEdge>();
  const adjacency = new Map<string, AdjEntry[]>();
  const reverseAdjacency = new Map<string, string[]>();

  for (const node of network.nodes) {
    nodes.set(node.id, node);
    adjacency.set(node.id, []);
    reverseAdjacency.set(node.id, []);
  }

  for (const edge of network.edges) {
    edges.set(edge.id, edge);
    if (adjacency.has(edge.from)) {
      adjacency.get(edge.from)!.push({ edgeId: edge.id, to: edge.to, edge });
    }
    if (edge.bidirectional && adjacency.has(edge.to)) {
      adjacency.get(edge.to)!.push({ edgeId: edge.id, to: edge.from, edge });
    }
    if (reverseAdjacency.has(edge.to)) {
      reverseAdjacency.get(edge.to)!.push(edge.from);
    }
    if (edge.bidirectional && reverseAdjacency.has(edge.from)) {
      reverseAdjacency.get(edge.from)!.push(edge.to);
    }
  }

  return { nodes, edges, adjacency, reverseAdjacency };
}

export function edgeLength(edge: NetworkEdge, from: string, to: string, graph: Graph): number {
  if (edge.length > 0) return edge.length;
  const fromNode = graph.nodes.get(from);
  const toNode = graph.nodes.get(to);
  if (!fromNode || !toNode) return 1;
  return Math.hypot(toNode.pos.x - fromNode.pos.x, toNode.pos.y - fromNode.pos.y);
}

export interface DijkstraResult {
  dist: Map<string, number>;
  prev: Map<string, string | null>;
  prevEdge: Map<string, string | null>;
}

export type EdgeCostFn = (edge: NetworkEdge, from: string, to: string) => number;

export function dijkstra(
  graph: Graph,
  source: string,
  costFn: EdgeCostFn,
  accessibleOnly: boolean = false,
): DijkstraResult {
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const prevEdge = new Map<string, string | null>();
  const visited = new Set<string>();

  for (const nodeId of graph.nodes.keys()) {
    dist.set(nodeId, Infinity);
    prev.set(nodeId, null);
    prevEdge.set(nodeId, null);
  }
  dist.set(source, 0);

  const queue: { id: string; d: number }[] = [{ id: source, d: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.d - b.d);
    const current = queue.shift()!;

    if (visited.has(current.id)) continue;
    visited.add(current.id);

    const neighbors = graph.adjacency.get(current.id) || [];
    for (const adj of neighbors) {
      if (visited.has(adj.to)) continue;
      if (adj.edge.closed) continue;
      if (accessibleOnly && adj.edge.accessible === 'stairs-only') continue;
      if (accessibleOnly && !adj.edge.bidirectional && adj.edge.accessible !== 'accessible') continue;

      const cost = costFn(adj.edge, current.id, adj.to);
      if (!isFinite(cost) || cost < 0) continue;

      const newDist = dist.get(current.id)! + cost;
      if (newDist < dist.get(adj.to)!) {
        dist.set(adj.to, newDist);
        prev.set(adj.to, current.id);
        prevEdge.set(adj.to, adj.edgeId);
        queue.push({ id: adj.to, d: newDist });
      }
    }
  }

  return { dist, prev, prevEdge };
}

export function reconstructPath(result: DijkstraResult, target: string): { path: string[]; edges: string[] } {
  const path: string[] = [];
  const edges: string[] = [];
  let current: string | null = target;

  while (current !== null) {
    path.unshift(current);
    const edgeId = result.prevEdge.get(current);
    if (edgeId) edges.unshift(edgeId);
    current = result.prev.get(current) || null;
  }

  if (path.length > 0 && path[0] === target && path.length === 1) {
    return { path: [], edges: [] };
  }

  return { path, edges };
}

export function shortestPath(
  graph: Graph,
  source: string,
  target: string,
  costFn: EdgeCostFn,
  accessibleOnly: boolean = false,
): { path: string[]; edges: string[]; cost: number } {
  if (source === target) return { path: [source], edges: [], cost: 0 };
  const result = dijkstra(graph, source, costFn, accessibleOnly);
  const { path, edges } = reconstructPath(result, target);
  const cost = result.dist.get(target) ?? Infinity;
  if (path.length === 0 || !isFinite(cost)) {
    return { path: [], edges: [], cost: Infinity };
  }
  return { path, edges, cost };
}

export function isConnected(graph: Graph): boolean {
  const nodes = Array.from(graph.nodes.keys());
  if (nodes.length === 0) return true;

  const visited = new Set<string>();
  const queue = [nodes[0]];
  visited.add(nodes[0]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = graph.adjacency.get(current) || [];
    for (const adj of neighbors) {
      if (adj.edge.closed) continue;
      if (!visited.has(adj.to)) {
        visited.add(adj.to);
        queue.push(adj.to);
      }
    }
  }

  return visited.size === nodes.length;
}

export function connectedComponents(graph: Graph): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const nodeId of graph.nodes.keys()) {
    if (visited.has(nodeId)) continue;
    const component: string[] = [];
    const queue = [nodeId];
    visited.add(nodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      const neighbors = graph.adjacency.get(current) || [];
      for (const adj of neighbors) {
        if (adj.edge.closed) continue;
        if (!visited.has(adj.to)) {
          visited.add(adj.to);
          queue.push(adj.to);
        }
      }
    }
    components.push(component);
  }

  return components;
}

export function findArticulationPoints(graph: Graph): string[] {
  const nodes = Array.from(graph.nodes.keys());
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const ap = new Set<string>();
  let timer = 0;

  function dfs(u: string): void {
    disc.set(u, timer);
    low.set(u, timer);
    timer++;
    let children = 0;

    const neighbors = graph.adjacency.get(u) || [];
    for (const adj of neighbors) {
      if (adj.edge.closed) continue;
      const v = adj.to;
      if (!disc.has(v)) {
        children++;
        parent.set(v, u);
        dfs(v);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        if (parent.get(u) === null && children > 1) ap.add(u);
        if (parent.get(u) !== null && low.get(v)! >= disc.get(u)!) ap.add(u);
      } else if (v !== parent.get(u)) {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  }

  for (const node of nodes) {
    if (!disc.has(node)) {
      parent.set(node, null);
      dfs(node);
    }
  }

  return Array.from(ap);
}

export function findBridgeEdges(graph: Graph): string[] {
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const bridges: string[] = [];
  let timer = 0;

  function dfs(u: string): void {
    disc.set(u, timer);
    low.set(u, timer);
    timer++;

    const neighbors = graph.adjacency.get(u) || [];
    for (const adj of neighbors) {
      if (adj.edge.closed) continue;
      const v = adj.to;
      if (!disc.has(v)) {
        parent.set(v, u);
        dfs(v);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        if (low.get(v)! > disc.get(u)!) {
          bridges.push(adj.edgeId);
        }
      } else if (v !== parent.get(u)) {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  }

  for (const node of graph.nodes.keys()) {
    if (!disc.has(node)) {
      parent.set(node, null);
      dfs(node);
    }
  }

  return bridges;
}

export function nodeDegree(graph: Graph, nodeId: string): number {
  return (graph.adjacency.get(nodeId) || []).length;
}

export function allPairsShortestPaths(
  graph: Graph,
  costFn: EdgeCostFn,
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  for (const nodeId of graph.nodes.keys()) {
    const dijk = dijkstra(graph, nodeId, costFn);
    result.set(nodeId, dijk.dist);
  }
  return result;
}

export function validateNetwork(network: SerializedNetwork): ValidationResult {
  const graph = buildGraph(network);
  const findings: ValidationFinding[] = [];

  // Check for disconnected nodes
  const components = connectedComponents(graph);
  if (components.length > 1) {
    for (const comp of components) {
      if (comp.length === 1) {
        findings.push({
          type: 'disconnected',
          message: `Node "${comp[0]}" is isolated from the rest of the network.`,
          elementIds: comp,
        });
      }
    }
    if (components.length > 1) {
      findings.push({
        type: 'disconnected',
        message: `Network has ${components.length} disconnected components.`,
        elementIds: components.flat(),
      });
    }
  }

  // Check for duplicate edges
  const edgeKeys = new Set<string>();
  for (const edge of network.edges) {
    const key = edge.bidirectional
      ? [edge.from, edge.to].sort().join('--')
      : `${edge.from}--${edge.to}`;
    if (edgeKeys.has(key)) {
      findings.push({
        type: 'duplicate-edge',
        message: `Duplicate connection between "${edge.from}" and "${edge.to}".`,
        elementIds: [edge.id],
      });
    }
    edgeKeys.add(key);
  }

  // Check destinations have feasible routes from entrances
  const entrances = network.nodes.filter(n => n.type === 'entrance');
  const destinations = network.nodes.filter(n => n.type === 'destination');
  const exits = network.nodes.filter(n => n.type === 'exit');

  for (const dest of destinations) {
    const reachable = entrances.some(ent => {
      const result = dijkstra(graph, ent.id, () => 1);
      return isFinite(result.dist.get(dest.id) ?? Infinity);
    });
    if (!reachable) {
      findings.push({
        type: 'unreachable-destination',
        message: `Destination "${dest.label || dest.id}" cannot be reached from any entrance.`,
        elementIds: [dest.id],
      });
    }
  }

  for (const ent of entrances) {
    const hasDest = destinations.some(dest => {
      const result = dijkstra(graph, ent.id, () => 1);
      return isFinite(result.dist.get(dest.id) ?? Infinity);
    });
    if (!hasDest) {
      findings.push({
        type: 'orphan-entrance',
        message: `Entrance "${ent.label || ent.id}" has no path to any destination.`,
        elementIds: [ent.id],
      });
    }
  }

  for (const exit of exits) {
    const reachable = network.nodes.some(n => {
      if (n.id === exit.id) return false;
      const result = dijkstra(graph, n.id, () => 1);
      return isFinite(result.dist.get(exit.id) ?? Infinity);
    });
    if (!reachable) {
      findings.push({
        type: 'unreachable-exit',
        message: `Exit "${exit.label || exit.id}" cannot be reached from the network.`,
        elementIds: [exit.id],
      });
    }
  }

  // Check accessibility conflicts
  const accessibleNodes = network.nodes.filter(n => n.accessible);
  for (const node of accessibleNodes) {
    const hasAccessibleEdge = (graph.adjacency.get(node.id) || []).some(
      adj => adj.edge.accessible !== 'stairs-only'
    );
    if (!hasAccessibleEdge) {
      findings.push({
        type: 'accessibility-conflict',
        message: `Accessible node "${node.label || node.id}" only connects via non-accessible edges.`,
        elementIds: [node.id],
      });
    }
  }

  return { valid: findings.length === 0, findings };
}

export function testReachabilityAfterRemoval(
  graph: Graph,
  removeNodeId: string,
): { reachable: boolean; components: string[][] } {
  const filteredNodes: NetworkNode[] = [];
  const filteredEdges: NetworkEdge[] = [];

  for (const [id, node] of graph.nodes) {
    if (id !== removeNodeId) filteredNodes.push(node);
  }
  for (const [, edge] of graph.edges) {
    if (edge.from !== removeNodeId && edge.to !== removeNodeId) {
      filteredEdges.push(edge);
    }
  }

  const subGraph = buildGraph({ nodes: filteredNodes, edges: filteredEdges, districts: [] });
  const components = connectedComponents(subGraph);
  return { reachable: components.length <= 1, components };
}

export function testEdgeRemoval(
  graph: Graph,
  removeEdgeId: string,
): { reachable: boolean; components: string[][] } {
  const filteredEdges: NetworkEdge[] = [];
  for (const [id, edge] of graph.edges) {
    if (id !== removeEdgeId) filteredEdges.push(edge);
  }
  const nodes = Array.from(graph.nodes.values());
  const subGraph = buildGraph({ nodes, edges: filteredEdges, districts: [] });
  const components = connectedComponents(subGraph);
  return { reachable: components.length <= 1, components };
}
