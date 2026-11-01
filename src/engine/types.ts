export type Vec2 = { x: number; y: number };

export type NodeType = 'intersection' | 'entrance' | 'exit' | 'destination' | 'crossing' | 'station';
export type EdgeType = 'walkway' | 'corridor' | 'street' | 'passage';

export type AccessibilityLevel = 'standard' | 'accessible' | 'stairs-only';

export interface NetworkNode {
  id: string;
  type: NodeType;
  pos: Vec2;
  label?: string;
  district?: string;
  capacity?: number;
  accessible: boolean;
  metadata?: Record<string, unknown>;
}

export interface NetworkEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  length: number;
  baseCapacity: number;
  accessible: AccessibilityLevel;
  bidirectional: boolean;
  closed: boolean;
  reducedCapacityFactor: number;
}

export type BehavioralProfile = 'direct' | 'cautious' | 'adaptive' | 'accessibility';
export type RoutingStrategy = 'shortest' | 'congestion-aware' | 'balanced';
export type AgentState = 'waiting' | 'moving' | 'arrived' | 'stranded' | 'queued';

export interface Agent {
  id: number;
  originNodeId: string;
  destinationNodeId: string;
  pos: Vec2;
  currentEdgeId: string | null;
  route: string[];
  routeIndex: number;
  progress: number;
  desiredSpeed: number;
  currentSpeed: number;
  profile: BehavioralProfile;
  accessible: boolean;
  state: AgentState;
  distanceTraveled: number;
  waitTime: number;
  congestionExposure: number;
  spawnedAt: number;
  arrivedAt: number | null;
  routeHistory: string[];
  rerouteCount: number;
  color: string;
}

export type DisruptionType =
  | 'station-closure'
  | 'blocked-passage'
  | 'demand-surge'
  | 'reduced-capacity'
  | 'event-dispersal'
  | 'temp-restriction';

export interface Disruption {
  id: string;
  type: DisruptionType;
  targetId: string;
  targetType: 'node' | 'edge';
  startTime: number;
  duration: number;
  intensity: number;
  active: boolean;
  applied: boolean;
  label: string;
}

export interface SimulationConfig {
  agentCount: number;
  routingStrategy: RoutingStrategy;
  profileDistribution: Record<BehavioralProfile, number>;
  simulationSpeed: number;
  maxSteps: number;
  seed: number;
  spawnRate: number;
  rerouteDelay: number;
  congestionWeight: number;
  size: 'small' | 'standard' | 'large';
}

export interface SimulationSnapshot {
  step: number;
  simTime: number;
  activeAgents: number;
  completedAgents: number;
  strandedAgents: number;
  avgTravelTime: number;
  medianTravelTime: number;
  completionRate: number;
  totalDistance: number;
  totalWaitTime: number;
  queueSize: number;
  congestionExposure: number;
  throughput: number;
  networkUtilization: number;
}

export interface SimulationRun {
  id: string;
  scenarioId: string;
  config: SimulationConfig;
  network: SerializedNetwork;
  disruptions: Disruption[];
  snapshots: SimulationSnapshot[];
  agentHistories: AgentHistoryRecord[];
  events: SimulationEvent[];
  startTime: number;
  endTime: number | null;
  status: 'running' | 'completed' | 'paused' | 'aborted';
  seed: number;
  version: string;
}

export interface AgentHistoryRecord {
  id: number;
  originNodeId: string;
  destinationNodeId: string;
  profile: BehavioralProfile;
  spawnedAt: number;
  arrivedAt: number | null;
  travelTime: number | null;
  distanceTraveled: number;
  waitTime: number;
  congestionExposure: number;
  routeUsed: string[];
  rerouteCount: number;
  state: AgentState;
}

export interface SimulationEvent {
  step: number;
  simTime: number;
  type: 'spawn' | 'arrival' | 'disruption-start' | 'disruption-end' | 'reroute' | 'stranded' | 'warning';
  description: string;
  agentId?: number;
  targetId?: string;
}

export interface SerializedNetwork {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  districts: string[];
}

export interface ValidationResult {
  valid: boolean;
  findings: ValidationFinding[];
}

export interface ValidationFinding {
  type: 'disconnected' | 'unreachable-destination' | 'orphan-entrance' | 'unreachable-exit' | 'duplicate-edge' | 'no-path' | 'accessibility-conflict';
  message: string;
  elementIds: string[];
}

export interface NotebookEntry {
  id: string;
  title: string;
  researchQuestion: string;
  hypothesis: string;
  scenario: string;
  config: string;
  runIds: string[];
  observations: string;
  results: string;
  interpretation: string;
  limitations: string;
  nextSteps: string;
  createdAt: number;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  objective: string;
  suggestedQuestions: string[];
  network: SerializedNetwork;
  config: SimulationConfig;
  disruptions: Disruption[];
  preview: string;
}
