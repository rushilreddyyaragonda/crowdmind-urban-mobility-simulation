import type { SerializedNetwork, NetworkNode, NetworkEdge, Scenario, SimulationConfig, Disruption } from './types';

export const APP_VERSION = '1.0.0';

export const DEFAULT_CONFIG: SimulationConfig = {
  agentCount: 200,
  routingStrategy: 'congestion-aware',
  profileDistribution: { direct: 0.4, cautious: 0.25, adaptive: 0.2, accessibility: 0.15 },
  simulationSpeed: 1,
  maxSteps: 5000,
  seed: 42,
  spawnRate: 2,
  rerouteDelay: 10,
  congestionWeight: 3,
  size: 'standard',
};

export const PROFILE_LABELS: Record<string, string> = {
  direct: 'Direct',
  cautious: 'Cautious',
  adaptive: 'Adaptive',
  accessibility: 'Accessibility-Conscious',
};

export const PROFILE_DESCRIPTIONS: Record<string, string> = {
  direct: 'Prefers short, efficient routes and avoids unnecessary detours.',
  cautious: 'Places greater weight on congestion, narrow passages, and perceived route difficulty.',
  adaptive: 'May reconsider its route when the current route becomes significantly slower or unavailable.',
  accessibility: 'Requires accessible paths and avoids infrastructure that violates accessibility constraints.',
};

let nodeCounter = 0;
let edgeCounter = 0;

function nid(): string {
  return `n${nodeCounter++}`;
}

function eid(): string {
  return `e${edgeCounter++}`;
}

function node(
  type: NetworkNode['type'],
  x: number,
  y: number,
  label: string,
  district: string,
  accessible: boolean = true,
  capacity: number = 100,
): NetworkNode {
  return { id: nid(), type, pos: { x, y }, label, district, accessible, capacity };
}

function edge(
  from: string,
  to: string,
  type: NetworkEdge['type'],
  baseCapacity: number,
  accessible: NetworkEdge['accessible'] = 'accessible',
  bidirectional: boolean = true,
  length: number = 0,
): NetworkEdge {
  return {
    id: eid(),
    from,
    to,
    type,
    length,
    baseCapacity,
    accessible,
    bidirectional,
    closed: false,
    reducedCapacityFactor: 1,
  };
}

function dist(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y));
}

// Build the main city network with 5 districts
export function buildMainCity(): SerializedNetwork {
  nodeCounter = 0;
  edgeCounter = 0;

  const nodes: NetworkNode[] = [];
  const edges: NetworkEdge[] = [];

  // === CENTRAL EXCHANGE === (center)
  const ce_int1 = node('intersection', 500, 350, 'CE Plaza', 'Central Exchange');
  const ce_int2 = node('intersection', 580, 350, 'CE Junction', 'Central Exchange');
  const ce_int3 = node('intersection', 500, 420, 'CE South', 'Central Exchange');
  const ce_int4 = node('intersection', 580, 420, 'CE East', 'Central Exchange');
  const ce_station = node('station', 540, 300, 'Central Station', 'Central Exchange', true, 200);
  const ce_square = node('destination', 540, 385, 'Central Square', 'Central Exchange', true, 500);
  nodes.push(ce_int1, ce_int2, ce_int3, ce_int4, ce_station, ce_square);

  // === RIVERSIDE QUARTER === (southwest, has narrow passages)
  const rq_int1 = node('intersection', 300, 500, 'RQ Gate', 'Riverside Quarter');
  const rq_int2 = node('intersection', 350, 550, 'RQ Cross', 'Riverside Quarter');
  const rq_int3 = node('intersection', 280, 580, 'RQ South', 'Riverside Quarter');
  const rq_narrow = node('intersection', 400, 480, 'RQ Narrows', 'Riverside Quarter');
  const rq_park = node('destination', 320, 620, 'Riverside Park', 'Riverside Quarter', true, 300);
  const rq_entrance = node('entrance', 200, 550, 'RQ Entrance', 'Riverside Quarter');
  nodes.push(rq_int1, rq_int2, rq_int3, rq_narrow, rq_park, rq_entrance);

  // === CIVIC CENTRE === (southeast, government buildings)
  const cc_int1 = node('intersection', 750, 450, 'CC Plaza', 'Civic Centre');
  const cc_int2 = node('intersection', 820, 420, 'CC East', 'Civic Centre');
  const cc_int3 = node('intersection', 780, 520, 'CC South', 'Civic Centre');
  const cc_hall = node('destination', 800, 380, 'City Hall', 'Civic Centre', true, 400);
  const cc_entrance = node('entrance', 880, 480, 'CC Entrance', 'Civic Centre');
  const cc_exit = node('exit', 850, 550, 'CC Exit', 'Civic Centre');
  nodes.push(cc_int1, cc_int2, cc_int3, cc_hall, cc_entrance, cc_exit);

  // === NORTHERN RESIDENTIAL ZONE === (north, residential)
  const nr_int1 = node('intersection', 400, 150, 'NR Junction', 'Northern Residential');
  const nr_int2 = node('intersection', 500, 100, 'NR Central', 'Northern Residential');
  const nr_int3 = node('intersection', 600, 150, 'NR East', 'Northern Residential');
  const nr_int4 = node('intersection', 450, 200, 'NR South', 'Northern Residential');
  const nr_entrance = node('entrance', 350, 80, 'NR Entrance', 'Northern Residential');
  const nr_station = node('station', 550, 80, 'NR Station', 'Northern Residential', true, 150);
  nodes.push(nr_int1, nr_int2, nr_int3, nr_int4, nr_entrance, nr_station);

  // === INNOVATION DISTRICT === (east, tech/office)
  const id_int1 = node('intersection', 700, 250, 'ID Hub', 'Innovation District');
  const id_int2 = node('intersection', 780, 200, 'ID North', 'Innovation District');
  const id_int3 = node('intersection', 750, 300, 'ID South', 'Innovation District');
  const id_lab = node('destination', 820, 250, 'Innovation Lab', 'Innovation District', true, 350);
  const id_entrance = node('entrance', 850, 180, 'ID Entrance', 'Innovation District');
  const id_exit = node('exit', 850, 320, 'ID Exit', 'Innovation District');
  nodes.push(id_int1, id_int2, id_int3, id_lab, id_entrance, id_exit);

  // === CONNECTIVITY EDGES ===

  // Central Exchange internal
  edges.push(edge(ce_int1.id, ce_int2.id, 'street', 80));
  edges.push(edge(ce_int1.id, ce_int3.id, 'street', 80));
  edges.push(edge(ce_int2.id, ce_int4.id, 'street', 80));
  edges.push(edge(ce_int3.id, ce_int4.id, 'street', 80));
  edges.push(edge(ce_int1.id, ce_station.id, 'corridor', 60));
  edges.push(edge(ce_int3.id, ce_square.id, 'corridor', 100));
  edges.push(edge(ce_int2.id, ce_square.id, 'corridor', 80));
  edges.push(edge(ce_int4.id, ce_square.id, 'corridor', 80));

  // Central Exchange to Northern Residential
  edges.push(edge(ce_int1.id, nr_int4.id, 'street', 70));
  edges.push(edge(nr_int4.id, nr_int1.id, 'street', 60));
  edges.push(edge(nr_int1.id, nr_int2.id, 'street', 50));
  edges.push(edge(nr_int2.id, nr_int3.id, 'street', 50));
  edges.push(edge(nr_int1.id, nr_entrance.id, 'street', 40));
  edges.push(edge(nr_int2.id, nr_station.id, 'corridor', 60));
  edges.push(edge(nr_int3.id, nr_station.id, 'street', 40));

  // Central Exchange to Riverside Quarter (includes narrow passage)
  edges.push(edge(ce_int3.id, rq_narrow.id, 'passage', 30, 'stairs-only')); // narrow passage - critical link
  edges.push(edge(rq_narrow.id, rq_int1.id, 'passage', 25, 'accessible')); // accessible alternative
  edges.push(edge(rq_int1.id, rq_int2.id, 'street', 50));
  edges.push(edge(rq_int2.id, rq_int3.id, 'street', 40));
  edges.push(edge(rq_int1.id, rq_entrance.id, 'street', 40));
  edges.push(edge(rq_int2.id, rq_park.id, 'corridor', 60));

  // Central Exchange to Civic Centre
  edges.push(edge(ce_int4.id, cc_int1.id, 'street', 70));
  edges.push(edge(cc_int1.id, cc_int2.id, 'street', 60));
  edges.push(edge(cc_int1.id, cc_int3.id, 'street', 50));
  edges.push(edge(cc_int2.id, cc_hall.id, 'corridor', 80));
  edges.push(edge(cc_int2.id, cc_entrance.id, 'street', 50));
  edges.push(edge(cc_int3.id, cc_exit.id, 'corridor', 50));
  edges.push(edge(cc_int3.id, cc_hall.id, 'street', 60));

  // Central Exchange to Innovation District
  edges.push(edge(ce_int2.id, id_int1.id, 'street', 60));
  edges.push(edge(id_int1.id, id_int2.id, 'street', 50));
  edges.push(edge(id_int1.id, id_int3.id, 'street', 50));
  edges.push(edge(id_int2.id, id_lab.id, 'corridor', 80));
  edges.push(edge(id_int2.id, id_entrance.id, 'street', 40));
  edges.push(edge(id_int3.id, id_lab.id, 'corridor', 60));
  edges.push(edge(id_int3.id, id_exit.id, 'corridor', 50));

  // Cross-district connections (redundancy)
  edges.push(edge(nr_int3.id, id_int2.id, 'street', 40)); // NR to ID
  edges.push(edge(cc_int1.id, id_int3.id, 'street', 50)); // CC to ID
  edges.push(edge(rq_int2.id, cc_int3.id, 'passage', 20, 'accessible')); // RQ to CC (narrow)
  edges.push(edge(nr_int1.id, rq_int1.id, 'street', 35, 'accessible')); // NR to RQ alternative

  // Compute lengths from positions
  const posMap = new Map<string, { x: number; y: number }>();
  for (const n of nodes) posMap.set(n.id, n.pos);
  for (const e of edges) {
    if (e.length === 0) {
      const p1 = posMap.get(e.from);
      const p2 = posMap.get(e.to);
      if (p1 && p2) e.length = dist(p1, p2);
    }
  }

  const districts = ['Central Exchange', 'Riverside Quarter', 'Civic Centre', 'Northern Residential', 'Innovation District'];

  return { nodes, edges, districts };
}

// Helper: create a disruption
function disruption(
  type: Disruption['type'],
  targetId: string,
  targetType: 'node' | 'edge',
  startTime: number,
  duration: number,
  intensity: number,
  label: string,
): Disruption {
  return {
    id: `d-${type}-${targetId}-${startTime}`,
    type,
    targetId,
    targetType,
    startTime,
    duration,
    intensity,
    active: false,
    applied: false,
    label,
  };
}

export function buildScenarios(): Scenario[] {
  const scenarios: Scenario[] = [];

  // === SCENARIO 01 — The Morning Rush ===
  {
    const network = buildMainCity();
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      agentCount: 350,
      spawnRate: 4,
      routingStrategy: 'congestion-aware',
      seed: 101,
    };
    // Find the NR entrance and Central Station
    const entrance = network.nodes.find(n => n.type === 'entrance' && n.district === 'Northern Residential');
    const station = network.nodes.find(n => n.type === 'station' && n.district === 'Northern Residential');
    const disruptions: Disruption[] = [];
    if (entrance && station) {
      disruptions.push(disruption('demand-surge', entrance.id, 'node', 10, 50, 2.0, 'Morning rush surge at NR Entrance'));
    }
    scenarios.push({
      id: 'morning-rush',
      name: 'Scenario 01 — The Morning Rush',
      description: 'A large number of agents enter from the Northern Residential Zone over a short period, heading toward Central Station and the Innovation District.',
      objective: 'Investigate congestion patterns and alternative routing under high arrival demand.',
      suggestedQuestions: [
        'Does congestion-aware routing reduce total waiting time compared to shortest-distance routing?',
        'Which edges become bottlenecks during peak demand?',
        'Does adding capacity to the central corridor reduce overall travel time?',
      ],
      network,
      config,
      disruptions,
      preview: 'Heavy inbound flow from Northern Residential toward Central Exchange',
    });
  }

  // === SCENARIO 02 — The Closed Station ===
  {
    const network = buildMainCity();
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      agentCount: 200,
      routingStrategy: 'congestion-aware',
      seed: 202,
    };
    const station = network.nodes.find(n => n.type === 'station' && n.district === 'Central Exchange');
    const disruptions: Disruption[] = [];
    if (station) {
      disruptions.push(disruption('station-closure', station.id, 'node', 30, 0, 1.0, 'Central Station closure'));
    }
    scenarios.push({
      id: 'closed-station',
      name: 'Scenario 02 — The Closed Station',
      description: 'A major station entrance becomes unavailable mid-simulation, forcing agents to find alternative routes.',
      objective: 'Investigate network redundancy and route redistribution when a critical node closes.',
      suggestedQuestions: [
        'How does closing Central Station affect travel times across the city?',
        'Which alternative routes absorb the redirected demand?',
        'Does the network recover, and how long does it take?',
      ],
      network,
      config,
      disruptions,
      preview: 'Central Station closes mid-simulation, redirecting all demand',
    });
  }

  // === SCENARIO 03 — The Narrow Corridor ===
  {
    const network = buildMainCity();
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      agentCount: 250,
      routingStrategy: 'shortest',
      seed: 303,
    };
    // Find the narrow passage between CE and RQ
    const narrow = network.edges.find(e => e.type === 'passage' && e.baseCapacity <= 30);
    const disruptions: Disruption[] = [];
    if (narrow) {
      disruptions.push(disruption('reduced-capacity', narrow.id, 'edge', 20, 100, 0.5, 'Narrow corridor capacity reduction'));
    }
    scenarios.push({
      id: 'narrow-corridor',
      name: 'Scenario 03 — The Narrow Corridor',
      description: 'A constrained passage connecting the Central Exchange and Riverside Quarter comes under pressure.',
      objective: 'Investigate capacity limits, queue formation, and the effect of routing strategy on bottleneck behavior.',
      suggestedQuestions: [
        'How does shortest-distance routing compare to congestion-aware routing at this bottleneck?',
        'What is the maximum throughput of the narrow corridor?',
        'Does providing an alternative wider route reduce queue length?',
      ],
      network,
      config,
      disruptions,
      preview: 'Narrow passage between Central Exchange and Riverside Quarter under stress',
    });
  }

  // === SCENARIO 04 — The Festival Dispersal ===
  {
    const network = buildMainCity();
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      agentCount: 150,
      spawnRate: 1,
      routingStrategy: 'congestion-aware',
      seed: 404,
    };
    const square = network.nodes.find(n => n.type === 'destination' && n.district === 'Central Exchange');
    const disruptions: Disruption[] = [];
    if (square) {
      disruptions.push(disruption('event-dispersal', square.id, 'node', 40, 30, 3.0, 'Festival dispersal at Central Square'));
    }
    scenarios.push({
      id: 'festival-dispersal',
      name: 'Scenario 04 — The Festival Dispersal',
      description: 'A large group of pedestrians leaves Central Square simultaneously after an event ends.',
      objective: 'Investigate exit capacity, crowd distribution, and whether the network can absorb sudden outbound surges.',
      suggestedQuestions: [
        'Which exits absorb the most dispersing agents?',
        'Does the dispersal create congestion in neighboring districts?',
        'Would adding a temporary exit reduce pressure on existing routes?',
      ],
      network,
      config,
      disruptions,
      preview: 'Sudden mass departure from Central Square toward all exits',
    });
  }

  // === SCENARIO 05 — The Accessibility Challenge ===
  {
    const network = buildMainCity();
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      agentCount: 200,
      profileDistribution: { direct: 0.2, cautious: 0.15, adaptive: 0.15, accessibility: 0.5 },
      routingStrategy: 'shortest',
      seed: 505,
    };
    scenarios.push({
      id: 'accessibility-challenge',
      name: 'Scenario 05 — The Accessibility Challenge',
      description: 'Half of all agents require accessible routes. Some passages are stairs-only, limiting route options.',
      objective: 'Investigate route availability, unequal journey times, and whether accessibility-conscious agents experience longer or more frequent route failures.',
      suggestedQuestions: [
        'Do accessibility-conscious agents experience longer average travel times?',
        'Are there destinations that accessibility-conscious agents cannot reach?',
        'Does converting stairs-only passages to accessible routes improve equity?',
      ],
      network,
      config,
      disruptions: [],
      preview: 'High proportion of accessibility-conscious agents in a city with stairs-only passages',
    });
  }

  // === SCENARIO 06 — The Cascading Disruption ===
  {
    const network = buildMainCity();
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      agentCount: 300,
      routingStrategy: 'congestion-aware',
      seed: 606,
    };
    // Find critical passages
    const passages = network.edges.filter(e => e.type === 'passage');
    const narrow = passages.find(e => e.baseCapacity <= 30);
    const alt = passages.find(e => e.baseCapacity > 30);

    const disruptions: Disruption[] = [];
    if (narrow) {
      disruptions.push(disruption('blocked-passage', narrow.id, 'edge', 30, 0, 1.0, 'Primary route blocked'));
    }
    if (alt) {
      disruptions.push(disruption('reduced-capacity', alt.id, 'edge', 50, 100, 0.6, 'Alternative route capacity reduced'));
    }
    scenarios.push({
      id: 'cascading-disruption',
      name: 'Scenario 06 — The Cascading Disruption',
      description: 'A primary route closes, redirecting demand to an already constrained alternative passage. Can local failures create wider network problems?',
      objective: 'Investigate cascading failures, network resilience, and whether compounded disruptions produce disproportionate effects.',
      suggestedQuestions: [
        'Does the combination of disruptions cause more congestion than the sum of each individually?',
        'Which parts of the network are most affected by the cascade?',
        'Would adding a new connection prevent the cascading failure?',
      ],
      network,
      config,
      disruptions,
      preview: 'Primary passage blocked + alternative route capacity reduced simultaneously',
    });
  }

  return scenarios;
}
