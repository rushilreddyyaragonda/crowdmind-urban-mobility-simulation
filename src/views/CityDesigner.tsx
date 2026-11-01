import { useRef, useEffect, useState, useCallback } from 'react';
import {
  Plus, Trash2, Move, MousePointer, Save, Undo, CheckCircle2,
  AlertTriangle, Download, Upload, Circle, Minus, Link2, Building2,
  LogOut, LogIn, Flag, X as XIcon, Settings,
} from 'lucide-react';
import type { SerializedNetwork, NetworkNode, NetworkEdge, NodeType, EdgeType, AccessibilityLevel } from '../engine/types';
import { validateNetwork, buildGraph } from '../engine/graph';
import { CityRenderer, DEFAULT_LAYERS, type CameraState, type RenderOptions } from '../render/renderer';

interface Props {
  network: SerializedNetwork;
  onSave: (network: SerializedNetwork) => void;
  simRunning: boolean;
}

type Tool = 'select' | 'add-node' | 'add-edge' | 'move' | 'delete' | 'add-entrance' | 'add-exit' | 'add-destination' | 'add-station';

const TOOLS: { id: Tool; label: string; icon: typeof Plus }[] = [
  { id: 'select', label: 'Select', icon: MousePointer },
  { id: 'add-node', label: 'Add Intersection', icon: Circle },
  { id: 'add-entrance', label: 'Add Entrance', icon: LogIn },
  { id: 'add-exit', label: 'Add Exit', icon: LogOut },
  { id: 'add-destination', label: 'Add Destination', icon: Flag },
  { id: 'add-station', label: 'Add Station', icon: Building2 },
  { id: 'add-edge', label: 'Add Walkway', icon: Link2 },
  { id: 'move', label: 'Move Node', icon: Move },
  { id: 'delete', label: 'Delete', icon: Trash2 },
];

export default function CityDesigner({ network, onSave, simRunning }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const [localNetwork, setLocalNetwork] = useState<SerializedNetwork>(() => JSON.parse(JSON.stringify(network)));
  const [tool, setTool] = useState<Tool>('select');
  const [camera, setCamera] = useState<CameraState>({ x: -100, y: -50, zoom: 1 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [edgeStart, setEdgeStart] = useState<string | null>(null);
  const [history, setHistory] = useState<SerializedNetwork[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const nodeCounter = useRef(0);
  const edgeCounter = useRef(0);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, camX: 0, camY: 0 });
  const isDraggingRef = useRef(false);
  const [dragNode, setDragNode] = useState<string | null>(null);

  // Sync when network prop changes
  useEffect(() => {
    setLocalNetwork(JSON.parse(JSON.stringify(network)));
  }, [network]);

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

  // Render
  useEffect(() => {
    if (!rendererRef.current) return;
    const renderer = rendererRef.current;
    const graph = buildGraph(localNetwork);
    const options: RenderOptions = {
      layers: { ...DEFAULT_LAYERS, congestion: false, pedestrians: false, labels: true },
      camera,
      selectedNodeId: selectedNode,
      selectedEdgeId: selectedEdge,
      selectedAgentId: null,
      highlightedNodeIds: edgeStart ? new Set([edgeStart]) : new Set(),
      highlightedEdgeIds: new Set(),
      showCongestionBase: true,
    };

    // Custom render without simulation state
    renderer.clear();
    const ctx = (renderer as any).ctx as CanvasRenderingContext2D;

    // Draw edges
    for (const edge of localNetwork.edges) {
      const fromNode = localNetwork.nodes.find(n => n.id === edge.from);
      const toNode = localNetwork.nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) continue;
      const fromScreen = { x: (fromNode.pos.x + camera.x) * camera.zoom, y: (fromNode.pos.y + camera.y) * camera.zoom };
      const toScreen = { x: (toNode.pos.x + camera.x) * camera.zoom, y: (toNode.pos.y + camera.y) * camera.zoom };

      const isSel = selectedEdge === edge.id;
      if (edge.closed) {
        ctx.strokeStyle = '#ef4444';
        ctx.setLineDash([6, 4]);
      } else if (isSel) {
        ctx.strokeStyle = '#5eead4';
      } else {
        ctx.strokeStyle = edge.type === 'passage' ? '#364463' : '#243049';
      }
      ctx.lineWidth = (isSel ? 3 : 2) * camera.zoom;
      ctx.beginPath();
      ctx.moveTo(fromScreen.x, fromScreen.y);
      ctx.lineTo(toScreen.x, toScreen.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw nodes
    for (const node of localNetwork.nodes) {
      const screen = { x: (node.pos.x + camera.x) * camera.zoom, y: (node.pos.y + camera.y) * camera.zoom };
      const colors: Record<string, string> = {
        intersection: '#5a6a8a', entrance: '#22d3ee', exit: '#5eead4',
        destination: '#fbbf24', crossing: '#8a9ab5', station: '#f59e0b',
      };
      const radii: Record<string, number> = {
        intersection: 4, entrance: 7, exit: 7, destination: 8, crossing: 5, station: 9,
      };
      const radius = (radii[node.type] || 4) * camera.zoom;
      const isSel = selectedNode === node.id;
      const isStart = edgeStart === node.id;

      if (isSel || isStart) {
        ctx.fillStyle = isSel ? 'rgba(94, 234, 212, 0.3)' : 'rgba(251, 191, 36, 0.3)';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius + 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = colors[node.type] || '#5a6a8a';
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isSel ? '#5eead4' : '#0a0e1a';
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.stroke();

      if (camera.zoom >= 0.5 && node.label && node.type !== 'intersection') {
        ctx.font = `${10 * camera.zoom}px Space Grotesk`;
        ctx.fillStyle = '#8a9ab5';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(node.label, screen.x, screen.y - radius - 3);
      }
    }
  });

  const pushHistory = useCallback((net: SerializedNetwork) => {
    setHistory(h => [...h.slice(-20), JSON.parse(JSON.stringify(net))]);
  }, []);

  const undo = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setLocalNetwork(JSON.parse(JSON.stringify(prev)));
      return h.slice(0, -1);
    });
  }, []);

  const genNodeId = () => {
    let maxNum = 0;
    for (const n of localNetwork.nodes) {
      const match = n.id.match(/^n(\d+)$/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    }
    return `n${maxNum + 1}`;
  };

  const genEdgeId = () => {
    let maxNum = 0;
    for (const e of localNetwork.edges) {
      const match = e.id.match(/^e(\d+)$/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    }
    return `e${maxNum + 1}`;
  };

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const world = renderer.screenToWorldPoint(x, y, camera);

    if (simRunning) {
      alert('Please pause or reset the simulation before editing the city.');
      return;
    }

    if (tool === 'select') {
      const graph = buildGraph(localNetwork);
      const nodeId = renderer.hitTestNode(x, y, graph, camera);
      if (nodeId) {
        setSelectedNode(nodeId);
        setSelectedEdge(null);
        return;
      }
      const edgeId = renderer.hitTestEdge(x, y, graph, camera);
      if (edgeId) {
        setSelectedEdge(edgeId);
        setSelectedNode(null);
        return;
      }
      setSelectedNode(null);
      setSelectedEdge(null);
      // Start panning
      isPanningRef.current = true;
      panStartRef.current = { x, y, camX: camera.x, camY: camera.y };
      return;
    }

    if (tool === 'move') {
      const graph = buildGraph(localNetwork);
      const nodeId = renderer.hitTestNode(x, y, graph, camera);
      if (nodeId) {
        setDragNode(nodeId);
        setSelectedNode(nodeId);
      }
      return;
    }

    if (tool === 'delete') {
      const graph = buildGraph(localNetwork);
      const nodeId = renderer.hitTestNode(x, y, graph, camera);
      if (nodeId) {
        pushHistory(localNetwork);
        setLocalNetwork(net => ({
          ...net,
          nodes: net.nodes.filter(n => n.id !== nodeId),
          edges: net.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
        }));
        return;
      }
      const edgeId = renderer.hitTestEdge(x, y, graph, camera);
      if (edgeId) {
        pushHistory(localNetwork);
        setLocalNetwork(net => ({
          ...net,
          edges: net.edges.filter(e => e.id !== edgeId),
        }));
      }
      return;
    }

    // Add node tools
    const addNodeTools: Tool[] = ['add-node', 'add-entrance', 'add-exit', 'add-destination', 'add-station'];
    if (addNodeTools.includes(tool)) {
      const typeMap: Record<string, NodeType> = {
        'add-node': 'intersection',
        'add-entrance': 'entrance',
        'add-exit': 'exit',
        'add-destination': 'destination',
        'add-station': 'station',
      };
      const type = typeMap[tool];
      const id = genNodeId();
      const labelMap: Record<string, string> = {
        intersection: `Junction ${id}`,
        entrance: `Entrance ${id}`,
        exit: `Exit ${id}`,
        destination: `Destination ${id}`,
        station: `Station ${id}`,
      };
      const newNode: NetworkNode = {
        id,
        type,
        pos: world,
        label: labelMap[type],
        district: 'Custom',
        accessible: true,
        capacity: 100,
      };
      pushHistory(localNetwork);
      setLocalNetwork(net => ({ ...net, nodes: [...net.nodes, newNode] }));
      return;
    }

    if (tool === 'add-edge') {
      const graph = buildGraph(localNetwork);
      const nodeId = renderer.hitTestNode(x, y, graph, camera);
      if (nodeId) {
        if (!edgeStart) {
          setEdgeStart(nodeId);
        } else if (edgeStart !== nodeId) {
          // Check for duplicate
          const exists = localNetwork.edges.some(e =>
            (e.from === edgeStart && e.to === nodeId) ||
            (e.from === nodeId && e.to === edgeStart) ||
            (e.bidirectional && e.from === edgeStart && e.to === nodeId)
          );
          if (exists) {
            alert('Connection already exists between these nodes.');
            setEdgeStart(null);
            return;
          }
          const fromNode = localNetwork.nodes.find(n => n.id === edgeStart);
          const toNode = localNetwork.nodes.find(n => n.id === nodeId);
          if (!fromNode || !toNode) return;
          const length = Math.round(Math.hypot(toNode.pos.x - fromNode.pos.x, toNode.pos.y - fromNode.pos.y));
          const newEdge: NetworkEdge = {
            id: genEdgeId(),
            from: edgeStart,
            to: nodeId,
            type: 'street',
            length,
            baseCapacity: 50,
            accessible: 'accessible',
            bidirectional: true,
            closed: false,
            reducedCapacityFactor: 1,
          };
          pushHistory(localNetwork);
          setLocalNetwork(net => ({ ...net, edges: [...net.edges, newEdge] }));
          setEdgeStart(null);
        } else {
          setEdgeStart(null);
        }
      }
      return;
    }

    // Default: pan
    isPanningRef.current = true;
    panStartRef.current = { x, y, camX: camera.x, camY: camera.y };
  }, [tool, camera, localNetwork, edgeStart, simRunning, pushHistory]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragNode) {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const world = renderer.screenToWorldPoint(x, y, camera);
      setLocalNetwork(net => ({
        ...net,
        nodes: net.nodes.map(n => n.id === dragNode ? { ...n, pos: world } : n),
      }));
      // Update edge lengths
      setLocalNetwork(net => ({
        ...net,
        edges: net.edges.map(e => {
          if (e.from !== dragNode && e.to !== dragNode) return e;
          const from = net.nodes.find(n => n.id === e.from);
          const to = net.nodes.find(n => n.id === e.to);
          if (!from || !to) return e;
          return { ...e, length: Math.round(Math.hypot(to.pos.x - from.pos.x, to.pos.y - from.pos.y)) };
        }),
      }));
      return;
    }

    if (isPanningRef.current) {
      const dx = (x - panStartRef.current.x) / camera.zoom;
      const dy = (y - panStartRef.current.y) / camera.zoom;
      setCamera(c => ({ ...c, x: panStartRef.current.camX + dx, y: panStartRef.current.camY + dy }));
    }
  }, [dragNode, camera]);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
    setDragNode(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setCamera(c => ({ ...c, zoom: Math.max(0.3, Math.min(4, c.zoom + delta * c.zoom)) }));
  }, []);

  const handleSave = useCallback(() => {
    onSave(JSON.parse(JSON.stringify(localNetwork)));
  }, [localNetwork, onSave]);

  const validation = validateNetwork(localNetwork);
  const selectedNodeData = selectedNode ? localNetwork.nodes.find(n => n.id === selectedNode) : null;
  const selectedEdgeData = selectedEdge ? localNetwork.edges.find(e => e.id === selectedEdge) : null;

  return (
    <div className="flex h-full">
      {/* Toolbar */}
      <div className="w-12 bg-ink-900 border-r border-ink-700 flex flex-col items-center py-2 gap-1">
        {TOOLS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => { setTool(t.id); setEdgeStart(null); }}
              className={`p-2.5 rounded-lg transition-colors group relative ${
                tool === t.id ? 'bg-accent-400/20 text-accent-300' : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200'
              }`}
              title={t.label}
            >
              <Icon className="w-4 h-4" />
              <span className="absolute left-full ml-2 px-2 py-1 bg-ink-800 text-ink-200 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                {t.label}
              </span>
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={undo}
          disabled={history.length === 0}
          className="p-2.5 rounded-lg text-ink-400 hover:bg-ink-800 hover:text-ink-200 disabled:opacity-30 transition-colors"
          title="Undo"
        >
          <Undo className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="absolute inset-0"
        />

        {/* Top bar */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          <div className="bg-ink-900/90 backdrop-blur-sm rounded-lg border border-ink-700 px-3 py-2 pointer-events-auto">
            <div className="text-xs text-ink-400 font-mono">CITY DESIGNER</div>
            <div className="text-sm font-medium">
              {localNetwork.nodes.length} nodes · {localNetwork.edges.length} edges
            </div>
          </div>
          <div className="flex items-center gap-2 pointer-events-auto">
            {simRunning && (
              <div className="bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2 text-xs text-amber-300">
                Pause simulation to edit
              </div>
            )}
            <button
              onClick={() => setShowValidation(!showValidation)}
              className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 transition-colors ${
                validation.valid
                  ? 'bg-accent-400/10 border-accent-400/30 text-accent-300'
                  : 'bg-amber-400/10 border-amber-400/30 text-amber-300'
              }`}
            >
              {validation.valid ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              <span className="hidden sm:inline">Validate</span>
              {validation.findings.length > 0 && (
                <span className="bg-amber-400/20 px-1.5 rounded text-xs">{validation.findings.length}</span>
              )}
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-2 rounded-lg bg-accent-400/20 border border-accent-400/50 text-accent-300 text-sm flex items-center gap-2 hover:bg-accent-400/30 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span className="hidden sm:inline">Apply to Simulation</span>
            </button>
          </div>
        </div>

        {/* Validation panel */}
        {showValidation && (
          <div className="absolute top-16 right-3 w-80 bg-ink-900/95 backdrop-blur-sm border border-ink-700 rounded-lg p-3 shadow-xl fade-in max-h-[60vh] overflow-y-auto z-20">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-ink-400 font-mono">VALIDATION RESULTS</div>
              <button onClick={() => setShowValidation(false)}>
                <XIcon className="w-3.5 h-3.5 text-ink-400" />
              </button>
            </div>
            {validation.valid ? (
              <div className="flex items-center gap-2 text-sm text-accent-300">
                <CheckCircle2 className="w-4 h-4" />
                Network is valid. All nodes are connected and reachable.
              </div>
            ) : (
              <div className="space-y-1.5">
                {validation.findings.map((f, i) => (
                  <div
                    key={i}
                    className="bg-amber-400/10 border border-amber-400/20 rounded-md p-2 text-xs cursor-pointer hover:bg-amber-400/20 transition-colors"
                    onClick={() => {
                      if (f.elementIds.length > 0) {
                        const id = f.elementIds[0];
                        if (localNetwork.nodes.find(n => n.id === id)) setSelectedNode(id);
                        else if (localNetwork.edges.find(e => e.id === id)) setSelectedEdge(id);
                      }
                    }}
                  >
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                      <span className="text-amber-200">{f.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Edge start indicator */}
        {edgeStart && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-cyan-400/20 border border-cyan-400/50 rounded-lg px-4 py-2 text-sm text-cyan-300 fade-in">
            Click another node to create a connection (started from {localNetwork.nodes.find(n => n.id === edgeStart)?.label})
          </div>
        )}
      </div>

      {/* Properties panel */}
      <div className="w-64 bg-ink-900 border-l border-ink-700 overflow-y-auto">
        <div className="p-3">
          <div className="text-[10px] text-ink-400 font-mono mb-2">PROPERTIES</div>
          {selectedNodeData ? (
            <NodeProperties
              node={selectedNodeData}
              onChange={(updated) => {
                pushHistory(localNetwork);
                setLocalNetwork(net => ({
                  ...net,
                  nodes: net.nodes.map(n => n.id === updated.id ? updated : n),
                }));
              }}
            />
          ) : selectedEdgeData ? (
            <EdgeProperties
              edge={selectedEdgeData}
              nodes={localNetwork.nodes}
              onChange={(updated) => {
                pushHistory(localNetwork);
                setLocalNetwork(net => ({
                  ...net,
                  edges: net.edges.map(e => e.id === updated.id ? updated : e),
                }));
              }}
            />
          ) : (
            <p className="text-xs text-ink-400">
              Select a node or edge to edit its properties. Use the toolbar on the left to add, move, or delete elements.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function NodeProperties({ node, onChange }: { node: NetworkNode; onChange: (n: NetworkNode) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-ink-200 font-medium">{node.label}</div>
        <div className="text-[10px] text-ink-500 font-mono">{node.id} · {node.type}</div>
      </div>
      <div>
        <div className="text-[10px] text-ink-400 mb-0.5">Label</div>
        <input
          type="text"
          value={node.label || ''}
          onChange={(e) => onChange({ ...node, label: e.target.value })}
          className="w-full bg-ink-700 border border-ink-600 rounded-md px-2 py-1 text-xs text-ink-200"
        />
      </div>
      <div>
        <div className="text-[10px] text-ink-400 mb-0.5">Type</div>
        <select
          value={node.type}
          onChange={(e) => onChange({ ...node, type: e.target.value as NodeType })}
          className="w-full bg-ink-700 border border-ink-600 rounded-md px-2 py-1 text-xs text-ink-200"
        >
          {['intersection', 'entrance', 'exit', 'destination', 'crossing', 'station'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        <div className="text-[10px] text-ink-400 mb-0.5">District</div>
        <input
          type="text"
          value={node.district || ''}
          onChange={(e) => onChange({ ...node, district: e.target.value })}
          className="w-full bg-ink-700 border border-ink-600 rounded-md px-2 py-1 text-xs text-ink-200"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-300 cursor-pointer">
        <input
          type="checkbox"
          checked={node.accessible}
          onChange={(e) => onChange({ ...node, accessible: e.target.checked })}
          className="accent-accent-400"
        />
        Accessible
      </label>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] text-ink-400 mb-0.5">X</div>
          <input
            type="number"
            value={Math.round(node.pos.x)}
            onChange={(e) => onChange({ ...node, pos: { ...node.pos, x: parseFloat(e.target.value) || 0 } })}
            className="w-full bg-ink-700 border border-ink-600 rounded-md px-2 py-1 text-xs font-mono text-ink-200"
          />
        </div>
        <div>
          <div className="text-[10px] text-ink-400 mb-0.5">Y</div>
          <input
            type="number"
            value={Math.round(node.pos.y)}
            onChange={(e) => onChange({ ...node, pos: { ...node.pos, y: parseFloat(e.target.value) || 0 } })}
            className="w-full bg-ink-700 border border-ink-600 rounded-md px-2 py-1 text-xs font-mono text-ink-200"
          />
        </div>
      </div>
    </div>
  );
}

function EdgeProperties({ edge, nodes, onChange }: { edge: NetworkEdge; nodes: NetworkNode[]; onChange: (e: NetworkEdge) => void }) {
  const fromNode = nodes.find(n => n.id === edge.from);
  const toNode = nodes.find(n => n.id === edge.to);
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-ink-200 font-medium">
          {fromNode?.label || edge.from} → {toNode?.label || edge.to}
        </div>
        <div className="text-[10px] text-ink-500 font-mono">{edge.id}</div>
      </div>
      <div>
        <div className="text-[10px] text-ink-400 mb-0.5">Edge Type</div>
        <select
          value={edge.type}
          onChange={(e) => onChange({ ...edge, type: e.target.value as EdgeType })}
          className="w-full bg-ink-700 border border-ink-600 rounded-md px-2 py-1 text-xs text-ink-200"
        >
          {['walkway', 'corridor', 'street', 'passage'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-ink-400">Capacity</span>
          <span className="text-[10px] font-mono text-accent-300">{edge.baseCapacity}</span>
        </div>
        <input
          type="range"
          min="5"
          max="200"
          step="5"
          value={edge.baseCapacity}
          onChange={(e) => onChange({ ...edge, baseCapacity: parseInt(e.target.value) })}
          className="w-full"
        />
      </div>
      <div>
        <div className="text-[10px] text-ink-400 mb-0.5">Accessibility</div>
        <select
          value={edge.accessible}
          onChange={(e) => onChange({ ...edge, accessible: e.target.value as AccessibilityLevel })}
          className="w-full bg-ink-700 border border-ink-600 rounded-md px-2 py-1 text-xs text-ink-200"
        >
          <option value="accessible">Accessible</option>
          <option value="standard">Standard</option>
          <option value="stairs-only">Stairs Only</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-300 cursor-pointer">
        <input
          type="checkbox"
          checked={edge.bidirectional}
          onChange={(e) => onChange({ ...edge, bidirectional: e.target.checked })}
          className="accent-accent-400"
        />
        Bidirectional
      </label>
      <label className="flex items-center gap-2 text-xs text-ink-300 cursor-pointer">
        <input
          type="checkbox"
          checked={edge.closed}
          onChange={(e) => onChange({ ...edge, closed: e.target.checked })}
          className="accent-crimson-400"
        />
        Closed
      </label>
      <div>
        <div className="text-[10px] text-ink-400 mb-0.5">Length</div>
        <input
          type="number"
          value={edge.length}
          onChange={(e) => onChange({ ...edge, length: parseInt(e.target.value) || 0 })}
          className="w-full bg-ink-700 border border-ink-600 rounded-md px-2 py-1 text-xs font-mono text-ink-200"
        />
      </div>
    </div>
  );
}
