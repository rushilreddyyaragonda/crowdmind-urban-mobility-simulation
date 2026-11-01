import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Network as NetIcon, GitBranch, AlertTriangle, Scissors,
  Search, Zap, Activity, Info,
} from 'lucide-react';
import type { SerializedNetwork } from '../engine/types';
import {
  buildGraph, connectedComponents, findArticulationPoints,
  findBridgeEdges, nodeDegree, testReachabilityAfterRemoval,
  testEdgeRemoval, allPairsShortestPaths, edgeLength,
} from '../engine/graph';
import { CityRenderer, DEFAULT_LAYERS, type CameraState, type RenderOptions } from '../render/renderer';

interface Props {
  network: SerializedNetwork;
}

export default function NetworkIntelligence({ network }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const [camera, setCamera] = useState<CameraState>({ x: -100, y: -50, zoom: 1 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [failureTest, setFailureTest] = useState<{ type: 'node' | 'edge'; id: string } | null>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  const graph = useMemo(() => buildGraph(network), [network]);
  const components = useMemo(() => connectedComponents(graph), [graph]);
  const articulationPoints = useMemo(() => findArticulationPoints(graph), [graph]);
  const bridgeEdges = useMemo(() => findBridgeEdges(graph), [graph]);

  const allPairs = useMemo<Map<string, Map<string, number>>>(() => {
    try {
      return allPairsShortestPaths(graph, (edge, from, to) => edgeLength(edge, from, to, graph));
    } catch {
      return new Map<string, Map<string, number>>();
    }
  }, [graph]);

  const nodeDegrees = useMemo(() => {
    const map = new Map<string, number>();
    for (const nodeId of graph.nodes.keys()) {
      map.set(nodeId, nodeDegree(graph, nodeId));
    }
    return map;
  }, [graph]);

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
    renderer.clear();
    const ctx = (renderer as any).ctx as CanvasRenderingContext2D;

    const highlightedNodes = new Set<string>();
    const highlightedEdges = new Set<string>();

    if (failureTest) {
      if (failureTest.type === 'node') {
        const result = testReachabilityAfterRemoval(graph, failureTest.id);
        if (result.components.length > 1) {
          result.components.forEach((comp, i) => {
            if (i > 0) comp.forEach(id => highlightedNodes.add(id));
          });
        }
      } else {
        const result = testEdgeRemoval(graph, failureTest.id);
        if (result.components.length > 1) {
          result.components.forEach((comp, i) => {
            if (i > 0) comp.forEach(id => highlightedNodes.add(id));
          });
        }
      }
    }

    articulationPoints.forEach(id => {
      if (!failureTest) highlightedNodes.add(id);
    });

    // Draw edges
    for (const edge of network.edges) {
      const fromNode = network.nodes.find(n => n.id === edge.from);
      const toNode = network.nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) continue;
      const fromScreen = { x: (fromNode.pos.x + camera.x) * camera.zoom, y: (fromNode.pos.y + camera.y) * camera.zoom };
      const toScreen = { x: (toNode.pos.x + camera.x) * camera.zoom, y: (toNode.pos.y + camera.y) * camera.zoom };

      const isBridge = bridgeEdges.includes(edge.id);
      const isSel = selectedEdge === edge.id;
      const isFailureTarget = failureTest?.type === 'edge' && failureTest.id === edge.id;

      if (isFailureTarget) {
        ctx.strokeStyle = '#ef4444';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 3 * camera.zoom;
      } else if (isSel) {
        ctx.strokeStyle = '#5eead4';
        ctx.lineWidth = 3 * camera.zoom;
      } else if (isBridge && !failureTest) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.5 * camera.zoom;
      } else {
        ctx.strokeStyle = '#243049';
        ctx.lineWidth = 2 * camera.zoom;
      }
      ctx.beginPath();
      ctx.moveTo(fromScreen.x, fromScreen.y);
      ctx.lineTo(toScreen.x, toScreen.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw nodes
    const colors: Record<string, string> = {
      intersection: '#5a6a8a', entrance: '#22d3ee', exit: '#5eead4',
      destination: '#fbbf24', crossing: '#8a9ab5', station: '#f59e0b',
    };
    const radii: Record<string, number> = {
      intersection: 4, entrance: 7, exit: 7, destination: 8, crossing: 5, station: 9,
    };

    for (const node of network.nodes) {
      const screen = { x: (node.pos.x + camera.x) * camera.zoom, y: (node.pos.y + camera.y) * camera.zoom };
      const radius = (radii[node.type] || 4) * camera.zoom;
      const isSel = selectedNode === node.id;
      const isAP = articulationPoints.includes(node.id);
      const isFailureTarget = failureTest?.type === 'node' && failureTest.id === node.id;
      const isDisconnected = highlightedNodes.has(node.id);

      if (isSel || isAP || isFailureTarget) {
        const glowColor = isFailureTarget ? 'rgba(239, 68, 68, 0.3)' : isAP ? 'rgba(251, 191, 36, 0.3)' : 'rgba(94, 234, 212, 0.3)';
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius + 5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (isDisconnected && failureTest) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius + 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = isFailureTarget ? '#ef4444' : colors[node.type] || '#5a6a8a';
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isSel ? '#5eead4' : isAP ? '#fbbf24' : '#0a0e1a';
      ctx.lineWidth = isSel || isAP ? 2 : 1;
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

  const handleCanvasClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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
    isPanningRef.current = true;
    panStartRef.current = { x, y, camX: camera.x, camY: camera.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanningRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = (x - panStartRef.current.x) / camera.zoom;
    const dy = (y - panStartRef.current.y) / camera.zoom;
    setCamera(c => ({ ...c, x: panStartRef.current.camX + dx, y: panStartRef.current.camY + dy }));
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setCamera(c => ({ ...c, zoom: Math.max(0.3, Math.min(4, c.zoom + delta * c.zoom)) }));
  };

  const selectedNodeData = selectedNode ? network.nodes.find(n => n.id === selectedNode) : null;
  const selectedEdgeData = selectedEdge ? network.edges.find(e => e.id === selectedEdge) : null;

  const failureResult = useMemo(() => {
    if (!failureTest) return null;
    if (failureTest.type === 'node') {
      return testReachabilityAfterRemoval(graph, failureTest.id);
    } else {
      return testEdgeRemoval(graph, failureTest.id);
    }
  }, [failureTest, graph]);

  return (
    <div className="flex h-full">
      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseUp={() => { isPanningRef.current = false; }}
          onMouseLeave={() => { isPanningRef.current = false; }}
          onWheel={handleWheel}
          className="absolute inset-0"
        />
        <div className="absolute top-3 left-3 bg-ink-900/90 backdrop-blur-sm rounded-lg border border-ink-700 px-3 py-2">
          <div className="text-xs text-ink-400 font-mono">NETWORK INTELLIGENCE</div>
          <div className="text-sm font-medium">
            {network.nodes.length} nodes · {network.edges.length} edges · {components.length} component{components.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 bg-ink-900/90 backdrop-blur-sm rounded-lg border border-ink-700 px-3 py-2 space-y-1">
          <div className="text-[10px] text-ink-400 font-mono mb-1">LEGEND</div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full border-2 border-amber-400" />
            <span className="text-ink-300">Articulation point</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-4 h-0.5 bg-amber-400" />
            <span className="text-ink-300">Bridge edge</span>
          </div>
          {failureTest && (
            <>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-crimson-400" />
                <span className="text-ink-300">Failure target</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-crimson-400/30" />
                <span className="text-ink-300">Disconnected</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Analysis panel */}
      <div className="w-80 lg:w-96 bg-ink-900 border-l border-ink-700 overflow-y-auto">
        <div className="p-3 space-y-3">
          {/* Network stats */}
          <div className="bg-ink-800/50 rounded-lg border border-ink-700 p-3">
            <div className="text-[10px] text-ink-400 font-mono mb-2">NETWORK STATISTICS</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Stat label="Nodes" value={network.nodes.length} />
              <Stat label="Edges" value={network.edges.length} />
              <Stat label="Components" value={components.length} />
              <Stat label="Articulation Pts" value={articulationPoints.length} />
              <Stat label="Bridge Edges" value={bridgeEdges.length} />
              <Stat label="Districts" value={network.districts.length} />
            </div>
          </div>

          {/* Failure testing */}
          <div className="bg-ink-800/50 rounded-lg border border-ink-700 p-3">
            <div className="text-[10px] text-ink-400 font-mono mb-2">FAILURE TESTING</div>
            <p className="text-xs text-ink-400 mb-2">
              Select a node or edge, then test what happens if it's removed from the network.
            </p>
            {selectedNode && (
              <button
                onClick={() => setFailureTest({ type: 'node', id: selectedNode })}
                className={`w-full text-xs px-3 py-2 rounded-md mb-2 transition-colors ${
                  failureTest?.type === 'node' && failureTest?.id === selectedNode
                    ? 'bg-crimson-400/20 text-crimson-300 border border-crimson-400/50'
                    : 'bg-ink-700 text-ink-300 border border-transparent hover:bg-ink-600'
                }`}
              >
                <Scissors className="w-3 h-3 inline mr-1" />
                Test removing {selectedNodeData?.label || selectedNode}
              </button>
            )}
            {selectedEdge && (
              <button
                onClick={() => setFailureTest({ type: 'edge', id: selectedEdge })}
                className={`w-full text-xs px-3 py-2 rounded-md mb-2 transition-colors ${
                  failureTest?.type === 'edge' && failureTest?.id === selectedEdge
                    ? 'bg-crimson-400/20 text-crimson-300 border border-crimson-400/50'
                    : 'bg-ink-700 text-ink-300 border border-transparent hover:bg-ink-600'
                }`}
              >
                <Scissors className="w-3 h-3 inline mr-1" />
                Test removing this edge
              </button>
            )}
            {failureTest && (
              <button
                onClick={() => setFailureTest(null)}
                className="w-full text-xs px-3 py-1.5 text-ink-400 hover:text-ink-200 transition-colors"
              >
                Clear failure test
              </button>
            )}
            {failureResult && (
              <div className={`rounded-md p-2 mt-2 text-xs ${failureResult.components.length > 1 ? 'bg-crimson-400/10 border border-crimson-400/30 text-crimson-300' : 'bg-accent-400/10 border border-accent-400/30 text-accent-300'}`}>
                {failureResult.components.length > 1 ? (
                  <>
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    Network splits into {failureResult.components.length} components.
                    {failureResult.components.map((c, i) => (
                      <div key={i} className="text-[10px] mt-0.5 pl-4">Component {i + 1}: {c.length} nodes</div>
                    ))}
                  </>
                ) : (
                  <>
                    <Info className="w-3 h-3 inline mr-1" />
                    Network remains connected after removal.
                  </>
                )}
              </div>
            )}
          </div>

          {/* Selected node info */}
          {selectedNodeData && (
            <div className="bg-ink-800/50 rounded-lg border border-ink-700 p-3">
              <div className="text-[10px] text-ink-400 font-mono mb-2">SELECTED NODE</div>
              <div className="text-sm font-medium text-ink-200">{selectedNodeData.label}</div>
              <div className="text-[10px] text-ink-500 mb-2">{selectedNodeData.type} · {selectedNodeData.id}</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-400">Degree</span>
                  <span className="text-ink-200 font-mono">{nodeDegrees.get(selectedNode!) || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">District</span>
                  <span className="text-ink-200">{selectedNodeData.district}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Is articulation pt</span>
                  <span className={articulationPoints.includes(selectedNode!) ? 'text-amber-400' : 'text-ink-500'}>
                    {articulationPoints.includes(selectedNode!) ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
              {/* Reachability */}
              <div className="mt-2 pt-2 border-t border-ink-700">
                <div className="text-[10px] text-ink-400 mb-1">REACHABILITY (shortest dist)</div>
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {Array.from(allPairs.get(selectedNode!)?.entries() || [])
                    .filter(([id, dist]) => id !== selectedNode && isFinite(dist))
                    .sort((a, b) => a[1] - b[1])
                    .slice(0, 10)
                    .map(([id, dist]) => {
                      const n = network.nodes.find(x => x.id === id);
                      return (
                        <div key={id} className="flex justify-between text-[10px]">
                          <span className="text-ink-400 truncate">{n?.label || id}</span>
                          <span className="text-ink-300 font-mono">{dist.toFixed(0)}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* Selected edge info */}
          {selectedEdgeData && (
            <div className="bg-ink-800/50 rounded-lg border border-ink-700 p-3">
              <div className="text-[10px] text-ink-400 font-mono mb-2">SELECTED EDGE</div>
              <div className="text-sm font-medium text-ink-200">
                {network.nodes.find(n => n.id === selectedEdgeData.from)?.label} → {network.nodes.find(n => n.id === selectedEdgeData.to)?.label}
              </div>
              <div className="space-y-1 text-xs mt-1">
                <div className="flex justify-between">
                  <span className="text-ink-400">Type</span>
                  <span className="text-ink-200">{selectedEdgeData.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Length</span>
                  <span className="text-ink-200 font-mono">{selectedEdgeData.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Capacity</span>
                  <span className="text-ink-200 font-mono">{selectedEdgeData.baseCapacity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Is bridge</span>
                  <span className={bridgeEdges.includes(selectedEdge!) ? 'text-amber-400' : 'text-ink-500'}>
                    {bridgeEdges.includes(selectedEdge!) ? 'Yes — removal disconnects network' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Articulation points list */}
          <div className="bg-ink-800/50 rounded-lg border border-ink-700 p-3">
            <div className="text-[10px] text-ink-400 font-mono mb-2">ARTICULATION POINTS ({articulationPoints.length})</div>
            <p className="text-[10px] text-ink-500 mb-2">Removing these nodes would disconnect the network.</p>
            <div className="space-y-1">
              {articulationPoints.map(id => {
                const n = network.nodes.find(x => x.id === id);
                return (
                  <button
                    key={id}
                    onClick={() => { setSelectedNode(id); setSelectedEdge(null); }}
                    className="w-full text-left text-xs text-ink-300 hover:text-amber-300 transition-colors truncate"
                  >
                    {n?.label || id} <span className="text-ink-500">({n?.type})</span>
                  </button>
                );
              })}
              {articulationPoints.length === 0 && (
                <span className="text-xs text-ink-500">None found.</span>
              )}
            </div>
          </div>

          {/* Bridge edges list */}
          <div className="bg-ink-800/50 rounded-lg border border-ink-700 p-3">
            <div className="text-[10px] text-ink-400 font-mono mb-2">BRIDGE EDGES ({bridgeEdges.length})</div>
            <p className="text-[10px] text-ink-500 mb-2">Removing these edges would disconnect the network.</p>
            <div className="space-y-1">
              {bridgeEdges.map(id => {
                const e = network.edges.find(x => x.id === id);
                const from = network.nodes.find(n => n.id === e?.from);
                const to = network.nodes.find(n => n.id === e?.to);
                return (
                  <button
                    key={id}
                    onClick={() => { setSelectedEdge(id); setSelectedNode(null); }}
                    className="w-full text-left text-xs text-ink-300 hover:text-amber-300 transition-colors truncate"
                  >
                    {from?.label} → {to?.label}
                  </button>
                );
              })}
              {bridgeEdges.length === 0 && (
                <span className="text-xs text-ink-500">None found.</span>
              )}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="bg-ink-800/30 rounded-lg border border-ink-700/50 p-2.5">
            <p className="text-[10px] text-ink-500 italic leading-relaxed">
              Graph-theoretic importance is not the same as predicted crowd behavior. A structurally important node is not necessarily the most congested, and a highly utilized edge is not necessarily the most critical edge. These results are separate from observed simulation outcomes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-ink-900/50 rounded-md p-2">
      <div className="text-[9px] text-ink-500">{label}</div>
      <div className="text-sm font-mono text-ink-200">{value}</div>
    </div>
  );
}
