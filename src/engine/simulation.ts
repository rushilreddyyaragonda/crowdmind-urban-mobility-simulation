import type {
  Agent,
  AgentState,
  BehavioralProfile,
  Disruption,
  NetworkNode,
  SimulationConfig,
  SimulationEvent,
  SimulationSnapshot,
  SerializedNetwork,
  RoutingStrategy,
  AgentHistoryRecord,
} from './types';
import type { Graph, EdgeCostFn } from './graph';
import { buildGraph, dijkstra, reconstructPath, edgeLength } from './graph';
import {
  CongestionModel,
  createCongestionModel,
  getOccupancy,
  incrementOccupancy,
  decrementOccupancy,
  incrementQueue,
  decrementQueue,
  congestionCost,
  congestionSpeedFactor,
  getNetworkUtilization,
  totalQueueSize,
  resetCongestionModel,
} from './congestion';
import { SeededRandom } from './rng';

const PROFILE_COLORS: Record<BehavioralProfile, string> = {
  direct: '#22d3ee',
  cautious: '#fbbf24',
  adaptive: '#5eead4',
  accessibility: '#a78bfa',
};

export interface SimulationState {
  graph: Graph;
  network: SerializedNetwork;
  config: SimulationConfig;
  agents: Map<number, Agent>;
  congestion: CongestionModel;
  disruptions: Disruption[];
  step: number;
  simTime: number;
  realTime: number;
  running: boolean;
  rng: SeededRandom;
  nextAgentId: number;
  events: SimulationEvent[];
  snapshots: SimulationSnapshot[];
  agentHistories: AgentHistoryRecord[];
  completedCount: number;
  spawnedCount: number;
  strandedCount: number;
  totalDistance: number;
  totalWaitTime: number;
  totalCongestionExposure: number;
  travelTimes: number[];
  spawnQueue: { originId: string; destId: string; profile: BehavioralProfile; accessible: boolean; spawnAt: number }[];
  disruptionApplied: Set<string>;
  disruptionReverted: Set<string>;
}

export function createSimulation(
  network: SerializedNetwork,
  config: SimulationConfig,
  disruptions: Disruption[],
): SimulationState {
  const graph = buildGraph(network);
  const rng = new SeededRandom(config.seed);
  const congestion = createCongestionModel();

  return {
    graph,
    network,
    config,
    agents: new Map(),
    congestion,
    disruptions: disruptions.map(d => ({ ...d, active: false, applied: false })),
    step: 0,
    simTime: 0,
    realTime: 0,
    running: false,
    rng,
    nextAgentId: 0,
    events: [],
    snapshots: [],
    agentHistories: [],
    completedCount: 0,
    spawnedCount: 0,
    strandedCount: 0,
    totalDistance: 0,
    totalWaitTime: 0,
    totalCongestionExposure: 0,
    travelTimes: [],
    spawnQueue: [],
    disruptionApplied: new Set(),
    disruptionReverted: new Set(),
  };
}

export function initializeSpawnQueue(
  state: SimulationState,
  entrances: NetworkNode[],
  destinations: NetworkNode[],
): void {
  const { config, rng } = state;
  const profiles: BehavioralProfile[] = ['direct', 'cautious', 'adaptive', 'accessibility'];
  const weights = profiles.map(p => config.profileDistribution[p] || 0);

  const spawnInterval = config.spawnRate > 0 ? 1 / config.spawnRate : 1;

  for (let i = 0; i < config.agentCount; i++) {
    if (entrances.length === 0 || destinations.length === 0) break;

    const entrance = rng.pick(entrances);
    let destination = rng.pick(destinations);
    let attempts = 0;
    while (destination.id === entrance.id && attempts < 10) {
      destination = rng.pick(destinations);
      attempts++;
    }

    const profile = rng.weightedPick(profiles, weights);
    const accessible = profile === 'accessibility';

    state.spawnQueue.push({
      originId: entrance.id,
      destId: destination.id,
      profile,
      accessible,
      spawnAt: i * spawnInterval,
    });
  }
}

function getCostFn(
  state: SimulationState,
  strategy: RoutingStrategy,
  accessibleOnly: boolean,
): EdgeCostFn {
  const { congestion, config, graph } = state;

  switch (strategy) {
    case 'shortest':
      return (edge, from, to) => {
        if (edge.closed) return Infinity;
        if (accessibleOnly && edge.accessible === 'stairs-only') return Infinity;
        return edgeLength(edge, from, to, graph);
      };

    case 'congestion-aware':
      return (edge, from, to) => {
        if (edge.closed) return Infinity;
        if (accessibleOnly && edge.accessible === 'stairs-only') return Infinity;
        const occ = getOccupancy(congestion, edge.id);
        return congestionCost(edge, occ, config.congestionWeight, graph, from, to);
      };

    case 'balanced':
      return (edge, from, to) => {
        if (edge.closed) return Infinity;
        if (accessibleOnly && edge.accessible === 'stairs-only') return Infinity;
        const occ = getOccupancy(congestion, edge.id);
        const baseLen = edgeLength(edge, from, to, graph);
        const effCap = edge.baseCapacity * edge.reducedCapacityFactor;
        if (effCap <= 0) return Infinity;
        const ratio = Math.min(occ / effCap, 1.0);
        // balanced: weight distance and congestion more evenly
        return baseLen * (1 + (config.congestionWeight * 0.5 + 0.5) * ratio * ratio);
      };

    default:
      return (edge, from, to) => edgeLength(edge, from, to, graph);
  }
}

function computeRoute(
  state: SimulationState,
  originId: string,
  destId: string,
  accessibleOnly: boolean,
): { path: string[]; edges: string[]; cost: number } {
  const { graph } = state;
  if (originId === destId) return { path: [originId], edges: [], cost: 0 };

  const costFn = getCostFn(state, state.config.routingStrategy, accessibleOnly);
  const result = dijkstra(graph, originId, costFn, accessibleOnly);
  const { path, edges } = reconstructPath(result, destId);
  const cost = result.dist.get(destId) ?? Infinity;

  if (path.length === 0 || !isFinite(cost)) {
    return { path: [], edges: [], cost: Infinity };
  }
  return { path, edges, cost };
}

function spawnAgent(
  state: SimulationState,
  originId: string,
  destId: string,
  profile: BehavioralProfile,
  accessible: boolean,
): void {
  const { graph, rng } = state;
  const originNode = graph.nodes.get(originId);
  if (!originNode) return;

  const routeResult = computeRoute(state, originId, destId, accessible);

  if (routeResult.path.length === 0) {
    // Stranded at spawn - no route exists
    const agent: Agent = {
      id: state.nextAgentId++,
      originNodeId: originId,
      destinationNodeId: destId,
      pos: { ...originNode.pos },
      currentEdgeId: null,
      route: [],
      routeIndex: 0,
      progress: 0,
      desiredSpeed: 1.0 + rng.next() * 0.3,
      currentSpeed: 0,
      profile,
      accessible,
      state: 'stranded',
      distanceTraveled: 0,
      waitTime: 0,
      congestionExposure: 0,
      spawnedAt: state.simTime,
      arrivedAt: null,
      routeHistory: [],
      rerouteCount: 0,
      color: PROFILE_COLORS[profile],
    };
    state.agents.set(agent.id, agent);
    state.strandedCount++;
    state.spawnedCount++;
    state.events.push({
      step: state.step,
      simTime: state.simTime,
      type: 'stranded',
      description: `Agent ${agent.id} spawned at ${originId} but no route to ${destId} exists.`,
      agentId: agent.id,
    });
    return;
  }

  const firstEdgeId = routeResult.edges[0] ?? null;
  const firstEdge = firstEdgeId ? graph.edges.get(firstEdgeId) : null;

  const agent: Agent = {
    id: state.nextAgentId++,
    originNodeId: originId,
    destinationNodeId: destId,
    pos: { ...originNode.pos },
    currentEdgeId: firstEdgeId,
    route: routeResult.path,
    routeIndex: 0,
    progress: 0,
    desiredSpeed: 1.0 + rng.next() * 0.3,
    currentSpeed: firstEdge ? agentSpeed(state, firstEdge.id) : 0,
    profile,
    accessible,
    state: firstEdge ? 'moving' : 'arrived',
    distanceTraveled: 0,
    waitTime: 0,
    congestionExposure: 0,
    spawnedAt: state.simTime,
    arrivedAt: null,
    routeHistory: [originId],
    rerouteCount: 0,
    color: PROFILE_COLORS[profile],
  };

  if (firstEdge) {
    incrementOccupancy(state.congestion, firstEdge.id);
  }

  state.agents.set(agent.id, agent);
  state.spawnedCount++;
  state.events.push({
    step: state.step,
    simTime: state.simTime,
    type: 'spawn',
    description: `Agent ${agent.id} spawned at ${originId}, heading to ${destId}.`,
    agentId: agent.id,
  });
}

function agentSpeed(state: SimulationState, edgeId: string): number {
  const edge = state.graph.edges.get(edgeId);
  if (!edge) return 0;
  const occ = getOccupancy(state.congestion, edge.id);
  const cap = edge.baseCapacity * edge.reducedCapacityFactor;
  return congestionSpeedFactor(occ, cap);
}

function moveAgent(state: SimulationState, agent: Agent, dt: number): void {
  if (agent.state !== 'moving' && agent.state !== 'queued') return;
  if (!agent.currentEdgeId) {
    // At a node, try to advance to next edge
    advanceToNextEdge(state, agent);
    return;
  }

  const { graph, congestion } = state;
  const edge = graph.edges.get(agent.currentEdgeId);
  if (!edge) {
    agent.state = 'stranded';
    return;
  }

  // Check if edge was closed while agent was on it
  if (edge.closed) {
    // Force reroute from current position
    rerouteAgent(state, agent);
    return;
  }

  const fromNode = agent.route[agent.routeIndex];
  const toNode = agent.route[agent.routeIndex + 1];

  // Determine actual edge direction
  let edgeFrom = edge.from;
  let edgeTo = edge.to;
  if (edge.from === toNode && edge.to === fromNode) {
    edgeFrom = edge.to;
    edgeTo = edge.from;
  }

  const fromN = graph.nodes.get(edgeFrom);
  const toN = graph.nodes.get(edgeTo);
  if (!fromN || !toN) {
    agent.state = 'stranded';
    return;
  }

  const edgeLen = edgeLength(edge, edgeFrom, edgeTo, graph);
  if (edgeLen <= 0) {
    // Instantly traverse
    agent.progress = 1;
  } else {
    const speed = agentSpeed(state, edge.id);
    agent.currentSpeed = speed * agent.desiredSpeed;
    const moveAmount = (agent.currentSpeed * dt) / edgeLen;
    agent.progress += moveAmount;
    agent.distanceTraveled += agent.currentSpeed * dt;
    state.totalDistance += agent.currentSpeed * dt;

    // Track congestion exposure
    const occ = getOccupancy(congestion, edge.id);
    const cap = edge.baseCapacity * edge.reducedCapacityFactor;
    if (cap > 0 && occ / cap > 0.7) {
      agent.congestionExposure += dt;
      state.totalCongestionExposure += dt;
    }
  }

  // Check if reached the end of this edge
  if (agent.progress >= 1) {
    agent.progress = 0;
    decrementOccupancy(congestion, edge.id);

    // Move agent to next node
    agent.routeIndex++;
    agent.routeHistory.push(toNode);
    agent.currentEdgeId = null;

    // Check arrival
    if (agent.routeIndex >= agent.route.length - 1) {
      arriveAgent(state, agent);
    } else {
      // Try to advance to next edge
      advanceToNextEdge(state, agent);
    }
  }
}

function advanceToNextEdge(state: SimulationState, agent: Agent): void {
  if (agent.routeIndex >= agent.route.length - 1) {
    arriveAgent(state, agent);
    return;
  }

  const currentNodeId = agent.route[agent.routeIndex];
  const nextNodeId = agent.route[agent.routeIndex + 1];
  const { graph, congestion } = state;

  // Find the edge between current and next node
  const adj = graph.adjacency.get(currentNodeId) || [];
  const adjEntry = adj.find(a => a.to === nextNodeId && !a.edge.closed);

  if (!adjEntry) {
    // Edge is closed or doesn't exist - try to reroute
    const canReroute = agent.profile === 'adaptive' || agent.profile === 'cautious';
    if (canReroute && agent.rerouteCount < 3) {
      rerouteAgent(state, agent);
    } else {
      // Check if we should wait
      const edgeExists = adj.find(a => a.to === nextNodeId);
      if (edgeExists && edgeExists.edge.closed) {
        // Edge exists but is closed - try rerouting
        rerouteAgent(state, agent);
      } else {
        agent.state = 'stranded';
        state.strandedCount++;
        state.events.push({
          step: state.step,
          simTime: state.simTime,
          type: 'stranded',
          description: `Agent ${agent.id} cannot find path from ${currentNodeId} to ${nextNodeId}.`,
          agentId: agent.id,
        });
      }
    }
    return;
  }

  // Check capacity - can we enter this edge?
  const edge = adjEntry.edge;
  const occ = getOccupancy(congestion, edge.id);
  const cap = edge.baseCapacity * edge.reducedCapacityFactor;

  if (occ >= cap) {
    // Queue - wait
    if (agent.state !== 'queued') {
      agent.state = 'queued';
      incrementQueue(congestion, edge.id);
    }
    agent.waitTime += 1;
    state.totalWaitTime += 1;
    return;
  }

  // Enter the edge
  if (agent.state === 'queued') {
    decrementQueue(congestion, edge.id);
  }
  agent.state = 'moving';
  agent.currentEdgeId = edge.id;
  agent.progress = 0;
  incrementOccupancy(congestion, edge.id);

  // Update position
  const fromNode = graph.nodes.get(currentNodeId);
  if (fromNode) {
    agent.pos = { ...fromNode.pos };
  }
}

function rerouteAgent(state: SimulationState, agent: Agent): void {
  const currentNodeId = agent.route[agent.routeIndex];
  const destId = agent.destinationNodeId;

  const routeResult = computeRoute(state, currentNodeId, destId, agent.accessible);

  if (routeResult.path.length === 0) {
    // Check if already queued and release queue
    if (agent.state === 'queued' && agent.currentEdgeId) {
      decrementQueue(state.congestion, agent.currentEdgeId);
    }
    agent.state = 'stranded';
    state.strandedCount++;
    state.events.push({
      step: state.step,
      simTime: state.simTime,
      type: 'stranded',
      description: `Agent ${agent.id} could not reroute from ${currentNodeId} to ${destId}.`,
      agentId: agent.id,
    });
    return;
  }

  agent.route = routeResult.path;
  agent.routeIndex = 0;
  agent.progress = 0;
  agent.rerouteCount++;
  agent.currentEdgeId = null;

  state.events.push({
    step: state.step,
    simTime: state.simTime,
    type: 'reroute',
    description: `Agent ${agent.id} rerouted from ${currentNodeId}. New route: ${routeResult.path.join(' → ')}`,
    agentId: agent.id,
  });

  // Try to advance on the new route
  advanceToNextEdge(state, agent);
}

function arriveAgent(state: SimulationState, agent: Agent): void {
  agent.state = 'arrived';
  agent.arrivedAt = state.simTime;
  const travelTime = agent.arrivedAt - agent.spawnedAt;
  state.travelTimes.push(travelTime);
  state.completedCount++;

  if (agent.currentEdgeId) {
    decrementOccupancy(state.congestion, agent.currentEdgeId);
    agent.currentEdgeId = null;
  }
  // Queue is already released in advanceToNextEdge when agent enters edge

  const destNode = state.graph.nodes.get(agent.destinationNodeId);
  if (destNode) {
    agent.pos = { ...destNode.pos };
  }

  state.events.push({
    step: state.step,
    simTime: state.simTime,
    type: 'arrival',
    description: `Agent ${agent.id} arrived at ${agent.destinationNodeId}. Travel time: ${travelTime.toFixed(1)}`,
    agentId: agent.id,
  });
}

function applyDisruptions(state: SimulationState): void {
  for (const disruption of state.disruptions) {
    // Check if it's time to activate
    if (!disruption.applied && state.simTime >= disruption.startTime) {
      disruption.applied = true;
      disruption.active = true;
      state.disruptionApplied.add(disruption.id);

      switch (disruption.type) {
        case 'station-closure': {
          const node = state.graph.nodes.get(disruption.targetId);
          if (node) {
            // Close all edges connected to this node
            for (const [, edge] of state.graph.edges) {
              if (edge.from === disruption.targetId || edge.to === disruption.targetId) {
                edge.closed = true;
              }
            }
          }
          break;
        }
        case 'blocked-passage': {
          const edge = state.graph.edges.get(disruption.targetId);
          if (edge) edge.closed = true;
          break;
        }
        case 'reduced-capacity': {
          const edge = state.graph.edges.get(disruption.targetId);
          if (edge) edge.reducedCapacityFactor = Math.max(0.1, 1 - disruption.intensity);
          break;
        }
        case 'temp-restriction': {
          const edge = state.graph.edges.get(disruption.targetId);
          if (edge) edge.closed = true;
          break;
        }
        case 'demand-surge': {
          // Add extra agents to spawn queue
          const node = state.graph.nodes.get(disruption.targetId);
          if (node && node.type === 'entrance') {
            const destinations = Array.from(state.graph.nodes.values()).filter(n => n.type === 'destination');
            if (destinations.length > 0) {
              const extra = Math.floor(disruption.intensity * 50);
              for (let i = 0; i < extra; i++) {
                const dest = state.rng.pick(destinations);
                state.spawnQueue.push({
                  originId: disruption.targetId,
                  destId: dest.id,
                  profile: 'direct',
                  accessible: false,
                  spawnAt: state.simTime + i * 0.5,
                });
              }
            }
          }
          break;
        }
        case 'event-dispersal': {
          // Add agents leaving from a destination
          const node = state.graph.nodes.get(disruption.targetId);
          if (node && node.type === 'destination') {
            const exits = Array.from(state.graph.nodes.values()).filter(n => n.type === 'exit' || n.type === 'entrance');
            if (exits.length > 0) {
              const extra = Math.floor(disruption.intensity * 50);
              for (let i = 0; i < extra; i++) {
                const exit = state.rng.pick(exits);
                state.spawnQueue.push({
                  originId: disruption.targetId,
                  destId: exit.id,
                  profile: 'direct',
                  accessible: false,
                  spawnAt: state.simTime + i * 0.3,
                });
              }
            }
          }
          break;
        }
      }

      state.events.push({
        step: state.step,
        simTime: state.simTime,
        type: 'disruption-start',
        description: `Disruption activated: ${disruption.label}`,
        targetId: disruption.targetId,
      });
    }

    // Check if it's time to deactivate (for temp disruptions)
    if (disruption.active && disruption.duration > 0 && state.simTime >= disruption.startTime + disruption.duration) {
      disruption.active = false;
      state.disruptionReverted.add(disruption.id);

      switch (disruption.type) {
        case 'station-closure': {
          const node = state.graph.nodes.get(disruption.targetId);
          if (node) {
            for (const [, edge] of state.graph.edges) {
              if (edge.from === disruption.targetId || edge.to === disruption.targetId) {
                edge.closed = false;
              }
            }
          }
          break;
        }
        case 'blocked-passage': {
          const edge = state.graph.edges.get(disruption.targetId);
          if (edge) edge.closed = false;
          break;
        }
        case 'reduced-capacity': {
          const edge = state.graph.edges.get(disruption.targetId);
          if (edge) edge.reducedCapacityFactor = 1;
          break;
        }
        case 'temp-restriction': {
          const edge = state.graph.edges.get(disruption.targetId);
          if (edge) edge.closed = false;
          break;
        }
      }

      state.events.push({
        step: state.step,
        simTime: state.simTime,
        type: 'disruption-end',
        description: `Disruption ended: ${disruption.label}`,
        targetId: disruption.targetId,
      });
    }
  }
}

function processSpawnQueue(state: SimulationState): void {
  const remaining: typeof state.spawnQueue = [];
  for (const item of state.spawnQueue) {
    if (item.spawnAt <= state.simTime) {
      spawnAgent(state, item.originId, item.destId, item.profile, item.accessible);
    } else {
      remaining.push(item);
    }
  }
  state.spawnQueue = remaining;
}

function updateWaitingAgents(state: SimulationState, dt: number): void {
  for (const [, agent] of state.agents) {
    if (agent.state === 'queued') {
      agent.waitTime += dt;
      state.totalWaitTime += dt;
      // Try to advance
      advanceToNextEdge(state, agent);
    } else if (agent.state === 'waiting') {
      agent.waitTime += dt;
      state.totalWaitTime += dt;
    }
  }
}

function checkAdaptiveReroute(state: SimulationState): void {
  for (const [, agent] of state.agents) {
    if (agent.state !== 'moving' && agent.state !== 'queued') continue;
    if (agent.profile !== 'adaptive' && agent.profile !== 'cautious') continue;
    if (agent.rerouteCount >= 3) continue;

    // Check if current edge is very congested
    if (agent.currentEdgeId) {
      const edge = state.graph.edges.get(agent.currentEdgeId);
      if (edge) {
        const occ = getOccupancy(state.congestion, edge.id);
        const cap = edge.baseCapacity * edge.reducedCapacityFactor;
        if (cap > 0 && occ / cap > 0.85 && state.rng.next() < 0.02) {
          // Reroute from current node
          rerouteAgent(state, agent);
        }
      }
    }
  }
}

export function stepSimulation(state: SimulationState, dt: number): void {
  if (!state.running) return;

  state.step++;
  state.simTime += dt;

  // Apply disruptions
  applyDisruptions(state);

  // Process spawn queue
  processSpawnQueue(state);

  // Update waiting agents
  updateWaitingAgents(state, dt);

  // Move agents
  for (const [, agent] of state.agents) {
    moveAgent(state, agent, dt);
  }

  // Check adaptive rerouting periodically
  if (state.step % 10 === 0) {
    checkAdaptiveReroute(state);
  }

  // Archive arrived agents
  const toArchive: number[] = [];
  for (const [id, agent] of state.agents) {
    if (agent.state === 'arrived') {
      toArchive.push(id);
    }
  }
  for (const id of toArchive) {
    const agent = state.agents.get(id);
    if (agent) {
      state.agentHistories.push({
        id: agent.id,
        originNodeId: agent.originNodeId,
        destinationNodeId: agent.destinationNodeId,
        profile: agent.profile,
        spawnedAt: agent.spawnedAt,
        arrivedAt: agent.arrivedAt,
        travelTime: agent.arrivedAt ? agent.arrivedAt - agent.spawnedAt : null,
        distanceTraveled: agent.distanceTraveled,
        waitTime: agent.waitTime,
        congestionExposure: agent.congestionExposure,
        routeUsed: agent.routeHistory,
        rerouteCount: agent.rerouteCount,
        state: agent.state,
      });
      state.agents.delete(id);
    }
  }

  // Take periodic snapshot
  if (state.step % 5 === 0 || state.step === 1) {
    state.snapshots.push(takeSnapshot(state));
  }
}

export function takeSnapshot(state: SimulationState): SimulationSnapshot {
  const activeAgents = state.agents.size;
  const completedAgents = state.completedCount;
  const strandedAgents = state.strandedCount;

  const travelTimes = state.travelTimes;
  const avgTravelTime = travelTimes.length > 0
    ? travelTimes.reduce((a, b) => a + b, 0) / travelTimes.length
    : 0;
  const medianTravelTime = travelTimes.length > 0
    ? travelTimes.slice().sort((a, b) => a - b)[Math.floor(travelTimes.length / 2)]
    : 0;
  const completionRate = state.spawnedCount > 0
    ? completedAgents / state.spawnedCount
    : 0;

  return {
    step: state.step,
    simTime: state.simTime,
    activeAgents,
    completedAgents,
    strandedAgents,
    avgTravelTime,
    medianTravelTime,
    completionRate,
    totalDistance: state.totalDistance,
    totalWaitTime: state.totalWaitTime,
    queueSize: totalQueueSize(state.congestion),
    congestionExposure: state.totalCongestionExposure,
    throughput: state.simTime > 0 ? completedAgents / state.simTime : 0,
    networkUtilization: getNetworkUtilization(state.congestion, state.network),
  };
}

export function getActiveAgentCount(state: SimulationState): number {
  let count = 0;
  for (const [, agent] of state.agents) {
    if (agent.state !== 'arrived') count++;
  }
  return count;
}

export function resetSimulation(state: SimulationState): void {
  // Rebuild from initial state
  const graph = buildGraph(state.network);
  state.graph = graph;
  state.agents.clear();
  resetCongestionModel(state.congestion);
  state.step = 0;
  state.simTime = 0;
  state.realTime = 0;
  state.nextAgentId = 0;
  state.events = [];
  state.snapshots = [];
  state.agentHistories = [];
  state.completedCount = 0;
  state.spawnedCount = 0;
  state.strandedCount = 0;
  state.totalDistance = 0;
  state.totalWaitTime = 0;
  state.totalCongestionExposure = 0;
  state.travelTimes = [];
  state.spawnQueue = [];
  state.disruptionApplied.clear();
  state.disruptionReverted.clear();
  state.disruptions = state.disruptions.map(d => ({ ...d, active: false, applied: false }));

  // Reset edge states
  for (const [, edge] of graph.edges) {
    edge.closed = false;
    edge.reducedCapacityFactor = 1;
  }

  // Re-initialize spawn queue
  const entrances = Array.from(graph.nodes.values()).filter(n => n.type === 'entrance');
  const destinations = Array.from(graph.nodes.values()).filter(n => n.type === 'destination');
  state.rng = new SeededRandom(state.config.seed);
  initializeSpawnQueue(state, entrances, destinations);
}

export function getAgentById(state: SimulationState, id: number): Agent | undefined {
  return state.agents.get(id) || undefined;
}

export function getAgentsOnEdge(state: SimulationState, edgeId: string): Agent[] {
  const agents: Agent[] = [];
  for (const [, agent] of state.agents) {
    if (agent.currentEdgeId === edgeId) agents.push(agent);
  }
  return agents;
}

export function getAgentsInDistrict(state: SimulationState, district: string): Agent[] {
  // Determine which nodes are in this district
  const districtNodes = new Set<string>();
  for (const [id, node] of state.graph.nodes) {
    if (node.district === district) districtNodes.add(id);
  }

  const agents: Agent[] = [];
  for (const [, agent] of state.agents) {
    // Check if agent's current position is near any node in the district
    for (const nodeId of districtNodes) {
      const node = state.graph.nodes.get(nodeId);
      if (node) {
        const dist = Math.hypot(agent.pos.x - node.pos.x, agent.pos.y - node.pos.y);
        if (dist < 80) {
          agents.push(agent);
          break;
        }
      }
    }
  }
  return agents;
}
