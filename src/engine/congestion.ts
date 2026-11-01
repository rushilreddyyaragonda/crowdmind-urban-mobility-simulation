import type { NetworkEdge } from './types';
import type { Graph } from './graph';
import type { SerializedNetwork } from './types';
import { edgeLength } from './graph';

export interface CongestionModel {
  edgeOccupancy: Map<string, number>;
  edgeQueue: Map<string, number>;
}

export function createCongestionModel(): CongestionModel {
  return {
    edgeOccupancy: new Map(),
    edgeQueue: new Map(),
  };
}

export function getOccupancy(model: CongestionModel, edgeId: string): number {
  return model.edgeOccupancy.get(edgeId) ?? 0;
}

export function getQueue(model: CongestionModel, edgeId: string): number {
  return model.edgeQueue.get(edgeId) ?? 0;
}

export function incrementOccupancy(model: CongestionModel, edgeId: string): void {
  model.edgeOccupancy.set(edgeId, (model.edgeOccupancy.get(edgeId) ?? 0) + 1);
}

export function decrementOccupancy(model: CongestionModel, edgeId: string): void {
  const current = model.edgeOccupancy.get(edgeId) ?? 0;
  model.edgeOccupancy.set(edgeId, Math.max(0, current - 1));
}

export function incrementQueue(model: CongestionModel, edgeId: string): void {
  model.edgeQueue.set(edgeId, (model.edgeQueue.get(edgeId) ?? 0) + 1);
}

export function decrementQueue(model: CongestionModel, edgeId: string): void {
  const current = model.edgeQueue.get(edgeId) ?? 0;
  model.edgeQueue.set(edgeId, Math.max(0, current - 1));
}

/**
 * Bounded congestion cost function.
 * As occupancy approaches capacity, traversal cost increases nonlinearly.
 * cost = baseLength * (1 + congestionWeight * (occupancy/capacity)^2)
 * Bounded because occupancy cannot exceed capacity.
 */
export function congestionCost(
  edge: NetworkEdge,
  occupancy: number,
  congestionWeight: number,
  graph: Graph,
  from: string,
  to: string,
): number {
  if (edge.closed) return Infinity;
  const baseLength = edgeLength(edge, from, to, graph);
  const effectiveCapacity = edge.baseCapacity * edge.reducedCapacityFactor;
  if (effectiveCapacity <= 0) return Infinity;

  const ratio = Math.min(occupancy / effectiveCapacity, 1.0);
  const congestionFactor = 1 + congestionWeight * ratio * ratio;
  return baseLength * congestionFactor;
}

/**
 * Speed factor based on congestion: agents slow down as edges get crowded.
 * Returns a value between minSpeedFactor and 1.0
 */
export function congestionSpeedFactor(
  occupancy: number,
  capacity: number,
  minFactor: number = 0.15,
): number {
  if (capacity <= 0) return 0;
  const ratio = Math.min(occupancy / capacity, 1.0);
  return 1.0 - (1.0 - minFactor) * ratio * ratio;
}

export function getEdgeUtilization(
  model: CongestionModel,
  edge: NetworkEdge,
): number {
  const occ = getOccupancy(model, edge.id);
  const cap = edge.baseCapacity * edge.reducedCapacityFactor;
  if (cap <= 0) return 0;
  return Math.min(occ / cap, 1.0);
}

export function getNetworkUtilization(
  model: CongestionModel,
  network: SerializedNetwork,
): number {
  if (network.edges.length === 0) return 0;
  let total = 0;
  let count = 0;
  for (const edge of network.edges) {
    if (edge.closed) continue;
    total += getEdgeUtilization(model, edge);
    count++;
  }
  return count > 0 ? total / count : 0;
}

export function totalQueueSize(model: CongestionModel): number {
  let total = 0;
  for (const q of model.edgeQueue.values()) total += q;
  return total;
}

export function totalOccupancy(model: CongestionModel): number {
  let total = 0;
  for (const occ of model.edgeOccupancy.values()) total += occ;
  return total;
}

export function resetCongestionModel(model: CongestionModel): void {
  model.edgeOccupancy.clear();
  model.edgeQueue.clear();
}
