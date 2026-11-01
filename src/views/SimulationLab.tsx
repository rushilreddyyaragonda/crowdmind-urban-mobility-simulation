import { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play, Pause, RotateCcw, StepForward, ZoomIn, ZoomOut,
  Layers, Eye, EyeOff, Activity, Users, Clock, MapPin,
  AlertTriangle, Maximize2, Settings, Info, ChevronDown, X,
} from 'lucide-react';
import type { SimulationHandle } from '../hooks/useSimulation';
import type { Scenario, Agent, BehavioralProfile } from '../engine/types';
import { CityRenderer, DEFAULT_LAYERS, type LayerVisibility, type CameraState, type RenderOptions } from '../render/renderer';
import { getOccupancy, getQueue, getEdgeUtilization } from '../engine/congestion';
import { PROFILE_LABELS, PROFILE_DESCRIPTIONS } from '../engine/city';
import MetricsPanel from '../components/MetricsPanel';
import DisruptionPanel from '../components/DisruptionPanel';
import AgentInspector from '../components/AgentInspector';
import RouteInspector from '../components/RouteInspector';
import { getPref, setPref } from '../utils/storage';

interface Props {
  sim: SimulationHandle;
  scenario: Scenario | null;
  scenarios: Scenario[];
  onLoadScenario: (s: Scenario) => void;
}

export default function SimulationLab({ sim, scenario, scenarios, onLoadScenario }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [layers, setLayers] = useState<LayerVisibility>(() => getPref('layers', DEFAULT_LAYERS));
  const [camera, setCamera] = useState<CameraState>({ x: -100, y: -50, zoom: 1 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [showLayers, setShowLayers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showScenarioPicker, setShowScenarioPicker] = useState(false);
  const [showAgentInspector, setShowAgentInspector] = useState(false);
  const [showRouteInspector, setShowRouteInspector] = useState(false);
  const [showDisruptionPanel, setShowDisruptionPanel] = useState(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  // Save layer prefs
  useEffect(() => {
    setPref('layers', layers);
  }, [layers]);

  // Initialize renderer
  useEffect(() => {
    if (!canvasRef.current) return;
    const renderer = new CityRenderer(canvasRef.current);
    rendererRef.current = renderer;
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      renderer.resize(rect.width, rect.height);
    }
  }, []);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    const renderer = rendererRef.current;
    if (!container || !renderer) return;
    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      renderer.resize(rect.width, rect.height);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Render loop
  useEffect(() => {
    if (!rendererRef.current || !sim.state) return;
    const renderer = rendererRef.current;
    const options: RenderOptions = {
      layers,
      camera,
      selectedNodeId,
      selectedEdgeId,
      selectedAgentId,
      highlightedNodeIds: new Set(),
      highlightedEdgeIds: new Set(),
      showCongestionBase: !layers.congestion,
    };
    renderer.render(sim.state, options);
  });

  // Canvas interaction
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer || !sim.state) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      isPanningRef.current = true;
      panStartRef.current = { x, y, camX: camera.x, camY: camera.y };
      return;
    }

    // Hit test: agents first, then nodes, then edges
    const agentId = renderer.hitTestAgent(x, y, sim.state, camera);
    if (agentId !== null) {
      setSelectedAgentId(agentId);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setShowAgentInspector(true);
      return;
    }

    const nodeId = renderer.hitTestNode(x, y, sim.state.graph, camera);
    if (nodeId) {
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(null);
      setSelectedAgentId(null);
      return;
    }

    const edgeId = renderer.hitTestEdge(x, y, sim.state.graph, camera);
    if (edgeId) {
      setSelectedEdgeId(edgeId);
      setSelectedNodeId(null);
      setSelectedAgentId(null);
      return;
    }

    // Start panning on empty space
    isPanningRef.current = true;
    panStartRef.current = { x, y, camX: camera.x, camY: camera.y };
  }, [camera, sim.state]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanningRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = (x - panStartRef.current.x) / camera.zoom;
    const dy = (y - panStartRef.current.y) / camera.zoom;
    setCamera(c => ({ ...c, x: panStartRef.current.camX + dx, y: panStartRef.current.camY + dy }));
  }, [camera.zoom]);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setCamera(c => ({
      ...c,
      zoom: Math.max(0.3, Math.min(4, c.zoom + delta * c.zoom)),
    }));
  }, []);

  const toggleLayer = useCallback((key: keyof LayerVisibility) => {
    setLayers(l => ({ ...l, [key]: !l[key] }));
  }, []);

  const handleReset = useCallback(() => {
    if (confirm('Reset the simulation to its initial state?')) {
      sim.reset();
      setSelectedAgentId(null);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  }, [sim]);

  const snapshot = sim.getSnapshot();

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ') { e.preventDefault(); sim.running ? sim.pause() : sim.start(); }
      if (e.key === 'r') handleReset();
      if (e.key === 's') sim.stepForward();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sim, handleReset]);

  return (
    <div className="flex h-full">
      {/* Main canvas area */}
      <div className="flex-1 relative overflow-hidden" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
          className="absolute inset-0 cursor-crosshair"
          style={{ cursor: isPanningRef.current ? 'grabbing' : 'crosshair' }}
        />

        {/* Top bar: scenario info */}
        <div className="absolute top-0 left-0 right-0 p-3 pointer-events-none">
          <div className="flex items-start justify-between gap-3">
            <div className="bg-ink-900/90 backdrop-blur-sm rounded-lg border border-ink-700 px-3 py-2 pointer-events-auto max-w-md">
              <div className="text-xs text-ink-400 font-mono mb-0.5">SCENARIO</div>
              <div className="text-sm font-medium text-ink-100 truncate">
                {scenario?.name || 'No scenario loaded'}
              </div>
              {scenario && (
                <div className="text-[11px] text-ink-400 mt-0.5 line-clamp-2">{scenario.description}</div>
              )}
            </div>

            {/* Scenario picker */}
            <div className="relative pointer-events-auto">
              <button
                onClick={() => setShowScenarioPicker(!showScenarioPicker)}
                className="bg-ink-900/90 backdrop-blur-sm rounded-lg border border-ink-700 px-3 py-2 text-sm flex items-center gap-2 hover:border-accent-400/50 transition-colors"
              >
                <Layers className="w-4 h-4 text-accent-300" />
                <span className="hidden sm:inline">Switch Scenario</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {showScenarioPicker && (
                <div className="absolute top-full right-0 mt-1 w-72 bg-ink-900 border border-ink-700 rounded-lg shadow-xl z-20 max-h-80 overflow-y-auto fade-in">
                  {scenarios.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { onLoadScenario(s); setShowScenarioPicker(false); }}
                      className={`w-full text-left px-3 py-2.5 text-sm border-b border-ink-800 last:border-0 hover:bg-ink-800 transition-colors ${
                        s.id === scenario?.id ? 'text-accent-300 bg-accent-400/5' : 'text-ink-200'
                      }`}
                    >
                      <div className="font-medium text-xs">{s.name}</div>
                      <div className="text-[11px] text-ink-400 mt-0.5 line-clamp-2">{s.preview}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom controls bar */}
        <div className="absolute bottom-0 left-0 right-0 p-3 pointer-events-none">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* Playback controls */}
            <div className="bg-ink-900/90 backdrop-blur-sm rounded-lg border border-ink-700 px-2 py-1.5 flex items-center gap-1 pointer-events-auto">
              <button
                onClick={() => sim.running ? sim.pause() : sim.start()}
                className={`p-2 rounded-md transition-colors ${sim.running ? 'text-amber-400 hover:bg-amber-400/10' : 'text-accent-300 hover:bg-accent-400/10'}`}
                title={sim.running ? 'Pause' : 'Play'}
              >
                {sim.running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={sim.stepForward}
                className="p-2 rounded-md text-ink-300 hover:text-accent-300 hover:bg-accent-400/10 transition-colors"
                title="Step Forward"
              >
                <StepForward className="w-4 h-4" />
              </button>
              <button
                onClick={handleReset}
                className="p-2 rounded-md text-ink-300 hover:text-crimson-400 hover:bg-crimson-400/10 transition-colors"
                title="Reset"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <div className="w-px h-5 bg-ink-700 mx-1" />
              <div className="flex items-center gap-1.5 px-1">
                <span className="text-[10px] text-ink-400 font-mono">SPEED</span>
                <input
                  type="range"
                  min="0.5"
                  max="8"
                  step="0.5"
                  value={sim.config?.simulationSpeed ?? 1}
                  onChange={(e) => sim.setSpeed(parseFloat(e.target.value))}
                  className="w-20"
                />
                <span className="text-[10px] text-ink-300 font-mono w-8">
                  {sim.config?.simulationSpeed.toFixed(1)}x
                </span>
              </div>
            </div>

            {/* Status display */}
            <div className="bg-ink-900/90 backdrop-blur-sm rounded-lg border border-ink-700 px-3 py-1.5 flex items-center gap-3 pointer-events-auto">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-ink-400" />
                <span className="text-xs font-mono text-ink-200">{sim.simTime.toFixed(1)}</span>
                <span className="text-[10px] text-ink-500">sim.t</span>
              </div>
              <div className="w-px h-4 bg-ink-700" />
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-ink-400" />
                <span className="text-xs font-mono text-ink-200">{sim.activeAgents}</span>
                <span className="text-[10px] text-ink-500">active</span>
              </div>
              <div className="w-px h-4 bg-ink-700" />
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-ink-400" />
                <span className="text-xs font-mono text-ink-200">{sim.step}</span>
                <span className="text-[10px] text-ink-500">steps</span>
              </div>
            </div>

            {/* Right: zoom and layers */}
            <div className="flex items-center gap-2 pointer-events-auto">
              <div className="bg-ink-900/90 backdrop-blur-sm rounded-lg border border-ink-700 px-1.5 py-1 flex items-center gap-0.5">
                <button
                  onClick={() => setCamera(c => ({ ...c, zoom: Math.max(0.3, c.zoom - 0.2) }))}
                  className="p-1.5 rounded-md text-ink-300 hover:text-accent-300 hover:bg-accent-400/10 transition-colors"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-mono text-ink-400 w-10 text-center">
                  {(camera.zoom * 100).toFixed(0)}%
                </span>
                <button
                  onClick={() => setCamera(c => ({ ...c, zoom: Math.min(4, c.zoom + 0.2) }))}
                  className="p-1.5 rounded-md text-ink-300 hover:text-accent-300 hover:bg-accent-400/10 transition-colors"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              <div className="relative">
                <button
                  onClick={() => setShowLayers(!showLayers)}
                  className="bg-ink-900/90 backdrop-blur-sm rounded-lg border border-ink-700 px-2.5 py-2 text-ink-300 hover:text-accent-300 hover:border-accent-400/50 transition-colors"
                  title="Layers"
                >
                  <Layers className="w-4 h-4" />
                </button>
                {showLayers && (
                  <div className="absolute bottom-full right-0 mb-1 w-52 bg-ink-900 border border-ink-700 rounded-lg shadow-xl p-2 fade-in z-20">
                    <div className="text-[10px] text-ink-400 font-mono mb-1.5 px-1">LAYER VISIBILITY</div>
                    {(Object.keys(DEFAULT_LAYERS) as (keyof LayerVisibility)[]).map(key => (
                      <button
                        key={key}
                        onClick={() => toggleLayer(key)}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-ink-800 text-sm transition-colors"
                      >
                        <span className="text-ink-200 capitalize">{key}</span>
                        {layers[key] ? (
                          <Eye className="w-4 h-4 text-accent-300" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-ink-500" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Selected element info popup */}
        {selectedNodeId && sim.state && (
          <NodeInfoCard
            nodeId={selectedNodeId}
            sim={sim}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
        {selectedEdgeId && sim.state && (
          <EdgeInfoCard
            edgeId={selectedEdgeId}
            sim={sim}
            onClose={() => setSelectedEdgeId(null)}
          />
        )}

        {/* Empty state */}
        {!sim.state && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Activity className="w-12 h-12 text-ink-600 mx-auto mb-3" />
              <p className="text-ink-400 text-sm">Loading simulation...</p>
            </div>
          </div>
        )}
      </div>

      {/* Right sidebar: metrics and controls */}
      {showControls && (
        <div className="w-80 lg:w-96 flex-shrink-0 bg-ink-900 border-l border-ink-700 overflow-y-auto">
          <div className="p-3 space-y-3">
            {/* Metrics */}
            <MetricsPanel sim={sim} snapshot={snapshot} />

            {/* Disruption panel toggle */}
            <button
              onClick={() => setShowDisruptionPanel(!showDisruptionPanel)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-ink-800 rounded-lg border border-ink-700 hover:border-amber-400/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium">Disruption Lab</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-ink-400 transition-transform ${showDisruptionPanel ? 'rotate-180' : ''}`} />
            </button>
            {showDisruptionPanel && (
              <DisruptionPanel sim={sim} />
            )}

            {/* Agent inspector toggle */}
            <button
              onClick={() => setShowAgentInspector(!showAgentInspector)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-ink-800 rounded-lg border border-ink-700 hover:border-accent-400/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-accent-300" />
                <span className="text-sm font-medium">Agent Inspector</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-ink-400 transition-transform ${showAgentInspector ? 'rotate-180' : ''}`} />
            </button>
            {showAgentInspector && selectedAgentId !== null && (
              <AgentInspector agentId={selectedAgentId} sim={sim} />
            )}
            {showAgentInspector && selectedAgentId === null && (
              <div className="text-xs text-ink-400 px-3 py-2 bg-ink-800/50 rounded-lg">
                Click on a moving pedestrian in the simulation to inspect their journey, route, and behavioral profile.
              </div>
            )}

            {/* Route inspector */}
            <button
              onClick={() => setShowRouteInspector(!showRouteInspector)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-ink-800 rounded-lg border border-ink-700 hover:border-cyan-400/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium">Route Inspector</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-ink-400 transition-transform ${showRouteInspector ? 'rotate-180' : ''}`} />
            </button>
            {showRouteInspector && sim.state && (
              <RouteInspector sim={sim} />
            )}

            {/* Settings */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-ink-800 rounded-lg border border-ink-700 hover:border-ink-500 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-ink-300" />
                <span className="text-sm font-medium">Configuration</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-ink-400 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
            </button>
            {showSettings && sim.config && (
              <ConfigPanel sim={sim} />
            )}

            {/* Legend */}
            <div className="bg-ink-800/50 rounded-lg border border-ink-700 p-3">
              <div className="text-[10px] text-ink-400 font-mono mb-2">LEGEND</div>
              <div className="space-y-1.5 text-xs">
                <LegendItem color="#22d3ee" label="Entrance" />
                <LegendItem color="#5eead4" label="Exit" />
                <LegendItem color="#fbbf24" label="Destination / Station" />
                <LegendItem color="#5a6a8a" label="Intersection" />
                <div className="h-px bg-ink-700 my-1.5" />
                <LegendItem color="#243049" label="Low congestion" />
                <LegendItem color="#fbbf24" label="Medium congestion" />
                <LegendItem color="#ef4444" label="High congestion / Closed" />
                <div className="h-px bg-ink-700 my-1.5" />
                <LegendItem color="#22d3ee" label="Direct agents" dot />
                <LegendItem color="#fbbf24" label="Cautious agents" dot />
                <LegendItem color="#5eead4" label="Adaptive agents" dot />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toggle sidebar */}
      <button
        onClick={() => setShowControls(!showControls)}
        className="absolute top-1/2 -translate-y-1/2 right-0 z-10 bg-ink-800 border border-ink-700 rounded-l-lg p-1.5 hover:bg-ink-700 transition-colors"
        style={{ right: showControls ? 'auto' : '0', left: showControls ? 'auto' : '0' }}
      >
        {showControls ? <ChevronDown className="w-4 h-4 rotate-90" /> : <ChevronDown className="w-4 h-4 -rotate-90" />}
      </button>
    </div>
  );
}

function LegendItem({ color, label, dot }: { color: string; label: string; dot?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {dot ? (
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
      ) : (
        <div className="w-4 h-1.5 rounded-sm flex-shrink-0" style={{ background: color }} />
      )}
      <span className="text-ink-300">{label}</span>
    </div>
  );
}

function NodeInfoCard({ nodeId, sim, onClose }: { nodeId: string; sim: SimulationHandle; onClose: () => void }) {
  if (!sim.state) return null;
  const node = sim.state.graph.nodes.get(nodeId);
  if (!node) return null;
  const connectedEdges = Array.from(sim.state.graph.edges.values()).filter(
    e => e.from === nodeId || e.to === nodeId
  );
  const agentsHere = Array.from(sim.state.agents.values()).filter(
    a => a.route[a.routeIndex] === nodeId
  );

  return (
    <div className="absolute top-16 left-3 w-64 bg-ink-900/95 backdrop-blur-sm border border-ink-700 rounded-lg p-3 shadow-xl fade-in z-20">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-[10px] text-ink-400 font-mono uppercase">{node.type}</div>
          <div className="text-sm font-medium">{node.label || node.id}</div>
        </div>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-200">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-ink-400">District</span>
          <span className="text-ink-200">{node.district || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-400">Accessible</span>
          <span className={node.accessible ? 'text-accent-300' : 'text-crimson-400'}>
            {node.accessible ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-400">Connections</span>
          <span className="text-ink-200">{connectedEdges.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-400">Agents here</span>
          <span className="text-ink-200">{agentsHere.length}</span>
        </div>
      </div>
    </div>
  );
}

function EdgeInfoCard({ edgeId, sim, onClose }: { edgeId: string; sim: SimulationHandle; onClose: () => void }) {
  if (!sim.state) return null;
  const edge = sim.state.graph.edges.get(edgeId);
  if (!edge) return null;
  const fromNode = sim.state.graph.nodes.get(edge.from);
  const toNode = sim.state.graph.nodes.get(edge.to);
  const occ = getOccupancy(sim.state.congestion, edge.id);
  const queue = getQueue(sim.state.congestion, edge.id);
  const util = getEdgeUtilization(sim.state.congestion, edge);
  const effCap = edge.baseCapacity * edge.reducedCapacityFactor;

  return (
    <div className="absolute top-16 left-3 w-64 bg-ink-900/95 backdrop-blur-sm border border-ink-700 rounded-lg p-3 shadow-xl fade-in z-20">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-[10px] text-ink-400 font-mono uppercase">{edge.type}</div>
          <div className="text-sm font-medium">
            {fromNode?.label || fromNode?.id} → {toNode?.label || toNode?.id}
          </div>
        </div>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-200">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-ink-400">Length</span>
          <span className="text-ink-200 font-mono">{edge.length.toFixed(0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-400">Base capacity</span>
          <span className="text-ink-200 font-mono">{edge.baseCapacity}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-400">Effective cap.</span>
          <span className={effCap < edge.baseCapacity ? 'text-amber-400 font-mono' : 'text-ink-200 font-mono'}>
            {effCap.toFixed(0)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-400">Occupancy</span>
          <span className="text-ink-200 font-mono">{occ}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-400">Queue</span>
          <span className={queue > 0 ? 'text-amber-400 font-mono' : 'text-ink-200 font-mono'}>{queue}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-400">Utilization</span>
          <span className={`font-mono ${(util * 100) > 70 ? 'text-crimson-400' : util > 0.4 ? 'text-amber-400' : 'text-accent-300'}`}>
            {(util * 100).toFixed(0)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-400">Accessible</span>
          <span className="text-ink-200">{edge.accessible}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-400">Status</span>
          <span className={edge.closed ? 'text-crimson-400' : 'text-accent-300'}>
            {edge.closed ? 'Closed' : 'Open'}
          </span>
        </div>
      </div>
    </div>
  );
}

function ConfigPanel({ sim }: { sim: SimulationHandle }) {
  if (!sim.config) return null;
  const config = sim.config;

  return (
    <div className="bg-ink-800/50 rounded-lg border border-ink-700 p-3 space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-ink-300">Agent Count</span>
          <span className="text-xs font-mono text-accent-300">{config.agentCount}</span>
        </div>
        <input
          type="range"
          min="10"
          max="500"
          step="10"
          value={config.agentCount}
          onChange={(e) => sim.updateConfig({ agentCount: parseInt(e.target.value) })}
          className="w-full"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-ink-300">Spawn Rate</span>
          <span className="text-xs font-mono text-accent-300">{config.spawnRate}/s</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="10"
          step="0.5"
          value={config.spawnRate}
          onChange={(e) => sim.updateConfig({ spawnRate: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-ink-300">Congestion Weight</span>
          <span className="text-xs font-mono text-accent-300">{config.congestionWeight.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min="0"
          max="10"
          step="0.5"
          value={config.congestionWeight}
          onChange={(e) => sim.updateConfig({ congestionWeight: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>

      <div>
        <div className="text-xs text-ink-300 mb-1.5">Routing Strategy</div>
        <div className="grid grid-cols-3 gap-1">
          {(['shortest', 'congestion-aware', 'balanced'] as const).map(strategy => (
            <button
              key={strategy}
              onClick={() => sim.updateConfig({ routingStrategy: strategy })}
              className={`text-[10px] px-2 py-1.5 rounded-md transition-colors ${
                config.routingStrategy === strategy
                  ? 'bg-accent-400/20 text-accent-300 border border-accent-400/50'
                  : 'bg-ink-700 text-ink-300 border border-transparent hover:bg-ink-600'
              }`}
            >
              {strategy === 'shortest' ? 'Shortest' : strategy === 'congestion-aware' ? 'Congestion' : 'Balanced'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-ink-300 mb-1.5">Behavioral Profile Distribution</div>
        <div className="space-y-2">
          {(Object.keys(PROFILE_LABELS) as BehavioralProfile[]).map(profile => (
            <div key={profile}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-ink-400">{PROFILE_LABELS[profile]}</span>
                <span className="text-[10px] font-mono text-accent-300">
                  {Math.round((config.profileDistribution[profile] || 0) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={config.profileDistribution[profile] || 0}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  const dist = { ...config.profileDistribution, [profile]: val } as Record<BehavioralProfile, number>;
                  // Normalize
                  const total = Object.values(dist).reduce((a, b) => a + b, 0);
                  if (total > 0) {
                    for (const k of Object.keys(dist) as BehavioralProfile[]) {
                      dist[k] = dist[k] / total;
                    }
                  }
                  sim.updateConfig({ profileDistribution: dist });
                }}
                className="w-full"
              />
            </div>
          ))}
        </div>
        <p className="text-[9px] text-ink-500 mt-2 italic">
          Profiles are simplified model assumptions, not scientifically validated representations of real human populations.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-ink-300">Random Seed</span>
          <span className="text-xs font-mono text-accent-300">{config.seed}</span>
        </div>
        <input
          type="number"
          value={config.seed}
          onChange={(e) => sim.updateConfig({ seed: parseInt(e.target.value) || 0 })}
          className="w-full bg-ink-700 border border-ink-600 rounded-md px-2 py-1 text-xs font-mono text-ink-200"
        />
      </div>

      <div className="text-[10px] text-ink-500 pt-1 border-t border-ink-700">
        Changes apply on next reset. Click the reset button to apply.
      </div>
    </div>
  );
}
