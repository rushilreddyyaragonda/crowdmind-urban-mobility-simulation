import type { SimulationState } from '../engine/simulation';
import type { NetworkNode, NetworkEdge, Agent, Vec2 } from '../engine/types';
import type { Graph } from '../engine/graph';
import { getOccupancy, getQueue } from '../engine/congestion';

export interface LayerVisibility {
  network: boolean;
  pedestrians: boolean;
  congestion: boolean;
  routes: boolean;
  disruption: boolean;
  accessibility: boolean;
  labels: boolean;
}

export const DEFAULT_LAYERS: LayerVisibility = {
  network: true,
  pedestrians: true,
  congestion: true,
  routes: false,
  disruption: true,
  accessibility: false,
  labels: true,
};

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface RenderOptions {
  layers: LayerVisibility;
  camera: CameraState;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedAgentId: number | null;
  highlightedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  showCongestionBase: boolean;
}

export interface CanvasMetrics {
  width: number;
  height: number;
}

const NODE_COLORS: Record<string, string> = {
  intersection: '#5a6a8a',
  entrance: '#22d3ee',
  exit: '#5eead4',
  destination: '#fbbf24',
  crossing: '#8a9ab5',
  station: '#f59e0b',
};

const NODE_RADIUS: Record<string, number> = {
  intersection: 4,
  entrance: 7,
  exit: 7,
  destination: 8,
  crossing: 5,
  station: 9,
};

export class CityRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private dpr: number = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    this.ctx = ctx;
  }

  resize(width: number, height: number): void {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(this.dpr, this.dpr);
  }

  getMetrics(): CanvasMetrics {
    return {
      width: this.canvas.width / this.dpr,
      height: this.canvas.height / this.dpr,
    };
  }

  clear(): void {
    const { width, height } = this.getMetrics();
    this.ctx.fillStyle = '#0a0e1a';
    this.ctx.fillRect(0, 0, width, height);

    // Grid pattern
    this.ctx.strokeStyle = '#121829';
    this.ctx.lineWidth = 1;
    const gridSize = 40;
    this.ctx.beginPath();
    for (let x = 0; x < width; x += gridSize) {
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
    }
    for (let y = 0; y < height; y += gridSize) {
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
    }
    this.ctx.stroke();
  }

  private worldToScreen(pos: Vec2, camera: CameraState): Vec2 {
    return {
      x: (pos.x + camera.x) * camera.zoom,
      y: (pos.y + camera.y) * camera.zoom,
    };
  }

  private screenToWorld(pos: Vec2, camera: CameraState): Vec2 {
    return {
      x: pos.x / camera.zoom - camera.x,
      y: pos.y / camera.zoom - camera.y,
    };
  }

  screenToWorldPoint(screenX: number, screenY: number, camera: CameraState): Vec2 {
    return this.screenToWorld({ x: screenX, y: screenY }, camera);
  }

  render(state: SimulationState, options: RenderOptions): void {
    this.clear();
    const { graph, congestion } = state;

    // Draw edges
    if (options.layers.network) {
      this.renderEdges(graph, congestion, options);
    }

    // Draw accessibility layer
    if (options.layers.accessibility) {
      this.renderAccessibilityOverlay(graph, options);
    }

    // Draw disruption overlay
    if (options.layers.disruption) {
      this.renderDisruptionOverlay(state, options);
    }

    // Draw route layer for selected agent
    if (options.layers.routes && options.selectedAgentId !== null) {
      this.renderAgentRoute(state, options);
    }

    // Draw nodes
    if (options.layers.network) {
      this.renderNodes(graph, options);
    }

    // Draw pedestrians
    if (options.layers.pedestrians) {
      this.renderAgents(state, options);
    }

    // Draw labels
    if (options.layers.labels) {
      this.renderLabels(graph, options);
    }
  }

  private renderEdges(graph: Graph, congestion: SimulationState['congestion'], options: RenderOptions): void {
    const ctx = this.ctx;
    const { camera, layers } = options;

    for (const [, edge] of graph.edges) {
      const fromNode = graph.nodes.get(edge.from);
      const toNode = graph.nodes.get(edge.to);
      if (!fromNode || !toNode) continue;

      const fromScreen = this.worldToScreen(fromNode.pos, camera);
      const toScreen = this.worldToScreen(toNode.pos, camera);

      const isSelected = options.selectedEdgeId === edge.id;
      const isHighlighted = options.highlightedEdgeIds.has(edge.id);

      // Base edge
      if (edge.closed) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2 * camera.zoom;
        ctx.setLineDash([6, 4]);
      } else if (layers.congestion && !options.showCongestionBase) {
        const occ = getOccupancy(congestion, edge.id);
        const cap = edge.baseCapacity * edge.reducedCapacityFactor;
        const ratio = cap > 0 ? Math.min(occ / cap, 1.0) : 0;
        ctx.strokeStyle = congestionColor(ratio);
        ctx.lineWidth = (2 + ratio * 4) * camera.zoom;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = edge.type === 'passage' ? '#364463' : '#243049';
        ctx.lineWidth = (edge.type === 'passage' ? 1.5 : 2) * camera.zoom;
        ctx.setLineDash([]);
      }

      if (isSelected) {
        ctx.strokeStyle = '#5eead4';
        ctx.lineWidth = 4 * camera.zoom;
      } else if (isHighlighted) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 3 * camera.zoom;
      }

      ctx.beginPath();
      ctx.moveTo(fromScreen.x, fromScreen.y);
      ctx.lineTo(toScreen.x, toScreen.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw arrow for directional edges
      if (!edge.bidirectional) {
        const midX = (fromScreen.x + toScreen.x) / 2;
        const midY = (fromScreen.y + toScreen.y) / 2;
        const angle = Math.atan2(toScreen.y - fromScreen.y, toScreen.x - fromScreen.x);
        const arrowSize = 6 * camera.zoom;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(midX - arrowSize * Math.cos(angle - 0.4), midY - arrowSize * Math.sin(angle - 0.4));
        ctx.lineTo(midX - arrowSize * Math.cos(angle + 0.4), midY - arrowSize * Math.sin(angle + 0.4));
        ctx.fill();
      }

      // Queue indicator
      if (layers.congestion) {
        const queueLen = getQueue(congestion, edge.id);
        if (queueLen > 0) {
          const midX = (fromScreen.x + toScreen.x) / 2;
          const midY = (fromScreen.y + toScreen.y) / 2;
          ctx.fillStyle = '#fbbf24';
          ctx.font = `${10 * camera.zoom}px JetBrains Mono`;
          ctx.textAlign = 'center';
          ctx.fillText(`${queueLen}`, midX, midY - 8 * camera.zoom);
        }
      }
    }
  }

  private renderAccessibilityOverlay(graph: Graph, options: RenderOptions): void {
    const ctx = this.ctx;
    const { camera } = options;

    for (const [, edge] of graph.edges) {
      if (edge.accessible === 'stairs-only') {
        const fromNode = graph.nodes.get(edge.from);
        const toNode = graph.nodes.get(edge.to);
        if (!fromNode || !toNode) continue;
        const fromScreen = this.worldToScreen(fromNode.pos, camera);
        const toScreen = this.worldToScreen(toNode.pos, camera);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.lineWidth = 6 * camera.zoom;
        ctx.beginPath();
        ctx.moveTo(fromScreen.x, fromScreen.y);
        ctx.lineTo(toScreen.x, toScreen.y);
        ctx.stroke();
      } else if (edge.accessible === 'accessible') {
        const fromNode = graph.nodes.get(edge.from);
        const toNode = graph.nodes.get(edge.to);
        if (!fromNode || !toNode) continue;
        const fromScreen = this.worldToScreen(fromNode.pos, camera);
        const toScreen = this.worldToScreen(toNode.pos, camera);
        ctx.strokeStyle = 'rgba(94, 234, 212, 0.3)';
        ctx.lineWidth = 5 * camera.zoom;
        ctx.beginPath();
        ctx.moveTo(fromScreen.x, fromScreen.y);
        ctx.lineTo(toScreen.x, toScreen.y);
        ctx.stroke();
      }
    }
  }

  private renderDisruptionOverlay(state: SimulationState, options: RenderOptions): void {
    const ctx = this.ctx;
    const { camera } = options;

    for (const disruption of state.disruptions) {
      if (!disruption.active && !disruption.applied) continue;

      let pos: Vec2 | null = null;
      if (disruption.targetType === 'node') {
        const node = state.graph.nodes.get(disruption.targetId);
        if (node) pos = node.pos;
      } else {
        const edge = state.graph.edges.get(disruption.targetId);
        if (edge) {
          const from = state.graph.nodes.get(edge.from);
          const to = state.graph.nodes.get(edge.to);
          if (from && to) {
            pos = { x: (from.pos.x + to.pos.x) / 2, y: (from.pos.y + to.pos.y) / 2 };
          }
        }
      }
      if (!pos) continue;

      const screen = this.worldToScreen(pos, camera);
      ctx.strokeStyle = disruption.active ? '#ef4444' : '#b91c1c';
      ctx.lineWidth = 2;
      const radius = 15 * camera.zoom;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      if (disruption.active) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius + 4 * Math.sin(Date.now() / 200), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private renderAgentRoute(state: SimulationState, options: RenderOptions): void {
    if (options.selectedAgentId === null) return;
    const agent = state.agents.get(options.selectedAgentId);
    if (!agent || agent.route.length === 0) return;

    const ctx = this.ctx;
    const { camera } = options;

    // Draw route as highlighted path
    for (let i = 0; i < agent.route.length - 1; i++) {
      const fromNode = state.graph.nodes.get(agent.route[i]);
      const toNode = state.graph.nodes.get(agent.route[i + 1]);
      if (!fromNode || !toNode) continue;
      const fromScreen = this.worldToScreen(fromNode.pos, camera);
      const toScreen = this.worldToScreen(toNode.pos, camera);
      ctx.strokeStyle = agent.color;
      ctx.lineWidth = 3 * camera.zoom;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(fromScreen.x, fromScreen.y);
      ctx.lineTo(toScreen.x, toScreen.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private renderNodes(graph: Graph, options: RenderOptions): void {
    const ctx = this.ctx;
    const { camera } = options;

    for (const [, node] of graph.nodes) {
      const screen = this.worldToScreen(node.pos, camera);
      const radius = (NODE_RADIUS[node.type] || 4) * camera.zoom;
      const isSelected = options.selectedNodeId === node.id;
      const isHighlighted = options.highlightedNodeIds.has(node.id);

      // Glow for selected/highlighted
      if (isSelected || isHighlighted) {
        ctx.fillStyle = isSelected ? 'rgba(94, 234, 212, 0.3)' : 'rgba(251, 191, 36, 0.3)';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius + 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Node fill
      ctx.fillStyle = NODE_COLORS[node.type] || '#5a6a8a';
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Node border
      ctx.strokeStyle = isSelected ? '#5eead4' : isHighlighted ? '#fbbf24' : '#0a0e1a';
      ctx.lineWidth = isSelected || isHighlighted ? 2 : 1;
      ctx.stroke();

      // Special shapes for certain types
      if (node.type === 'station' || node.type === 'destination') {
        ctx.strokeStyle = NODE_COLORS[node.type];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private renderAgents(state: SimulationState, options: RenderOptions): void {
    const ctx = this.ctx;
    const { camera } = options;
    const agentRadius = 2.5 * camera.zoom;

    for (const [, agent] of state.agents) {
      const screen = this.worldToScreen(agent.pos, camera);
      const isSelected = options.selectedAgentId === agent.id;

      if (isSelected) {
        ctx.fillStyle = 'rgba(94, 234, 212, 0.3)';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, agentRadius + 5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (agent.state === 'stranded') {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, agentRadius + 1, 0, Math.PI * 2);
        ctx.fill();
      } else if (agent.state === 'queued' || agent.state === 'waiting') {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, agentRadius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = agent.color;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, agentRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private renderLabels(graph: Graph, options: RenderOptions): void {
    const ctx = this.ctx;
    const { camera } = options;
    if (camera.zoom < 0.5) return;

    ctx.font = `${10 * camera.zoom}px Space Grotesk`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (const [, node] of graph.nodes) {
      if (node.type === 'intersection' || node.type === 'crossing') continue;
      if (!node.label) continue;
      const screen = this.worldToScreen(node.pos, camera);
      const radius = (NODE_RADIUS[node.type] || 4) * camera.zoom;
      ctx.fillStyle = '#8a9ab5';
      ctx.fillText(node.label, screen.x, screen.y - radius - 3);
    }
  }

  hitTestNode(screenX: number, screenY: number, graph: Graph, camera: CameraState): string | null {
    let closest: string | null = null;
    let closestDist = 15;
    for (const [, node] of graph.nodes) {
      const screen = this.worldToScreen(node.pos, camera);
      const dist = Math.hypot(screen.x - screenX, screen.y - screenY);
      const radius = (NODE_RADIUS[node.type] || 4) * camera.zoom + 5;
      if (dist < radius && dist < closestDist) {
        closestDist = dist;
        closest = node.id;
      }
    }
    return closest;
  }

  hitTestEdge(screenX: number, screenY: number, graph: Graph, camera: CameraState): string | null {
    let closest: string | null = null;
    let closestDist = 10;

    for (const [, edge] of graph.edges) {
      const fromNode = graph.nodes.get(edge.from);
      const toNode = graph.nodes.get(edge.to);
      if (!fromNode || !toNode) continue;
      const fromScreen = this.worldToScreen(fromNode.pos, camera);
      const toScreen = this.worldToScreen(toNode.pos, camera);

      const dist = pointToSegmentDistance(
        screenX, screenY,
        fromScreen.x, fromScreen.y,
        toScreen.x, toScreen.y,
      );
      if (dist < closestDist) {
        closestDist = dist;
        closest = edge.id;
      }
    }
    return closest;
  }

  hitTestAgent(screenX: number, screenY: number, state: SimulationState, camera: CameraState): number | null {
    let closest: number | null = null;
    let closestDist = 8;
    for (const [id, agent] of state.agents) {
      const screen = this.worldToScreen(agent.pos, camera);
      const dist = Math.hypot(screen.x - screenX, screen.y - screenY);
      if (dist < closestDist) {
        closestDist = dist;
        closest = id;
      }
    }
    return closest;
  }
}

function congestionColor(ratio: number): string {
  if (ratio < 0.3) return '#243049';
  if (ratio < 0.5) return '#0e7490';
  if (ratio < 0.7) return '#fbbf24';
  if (ratio < 0.9) return '#f59e0b';
  return '#ef4444';
}

function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}
