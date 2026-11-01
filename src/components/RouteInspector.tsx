import { useState, useMemo } from 'react';
import type { SimulationHandle } from '../hooks/useSimulation';
import { Route, GitBranch, Clock, MapPin, Info } from 'lucide-react';
import { shortestPath, edgeLength, type EdgeCostFn } from '../engine/graph';
import { getOccupancy, congestionCost } from '../engine/congestion';
import type { NetworkEdge } from '../engine/types';

interface Props {
  sim: SimulationHandle;
}

export default function RouteInspector({ sim }: Props) {
  const [originId, setOriginId] = useState('');
  const [destId, setDestId] = useState('');
  const [strategy, setStrategy] = useState<'shortest' | 'congestion-aware' | 'balanced'>('shortest');
  const [accessibleOnly, setAccessibleOnly] = useState(false);

  const state = sim.state;
  const nodes = useMemo(() => state ? Array.from(state.graph.nodes.values()) : [], [state]);
  const entrances = nodes.filter(n => n.type === 'entrance' || n.type === 'station');
  const destinations = nodes.filter(n => n.type === 'destination' || n.type === 'exit');

  const makeCostFn = (strat: string, accOnly: boolean): EdgeCostFn => {
    if (!state) return () => Infinity;
    switch (strat) {
      case 'shortest':
        return (edge: NetworkEdge, from: string, to: string) => {
          if (edge.closed) return Infinity;
          if (accOnly && edge.accessible === 'stairs-only') return Infinity;
          return edgeLength(edge, from, to, state.graph);
        };
      case 'congestion-aware':
        return (edge: NetworkEdge, from: string, to: string) => {
          if (edge.closed) return Infinity;
          if (accOnly && edge.accessible === 'stairs-only') return Infinity;
          const occ = getOccupancy(state.congestion, edge.id);
          return congestionCost(edge, occ, state.config.congestionWeight, state.graph, from, to);
        };
      case 'balanced':
        return (edge: NetworkEdge, from: string, to: string) => {
          if (edge.closed) return Infinity;
          if (accOnly && edge.accessible === 'stairs-only') return Infinity;
          const baseLen = edgeLength(edge, from, to, state.graph);
          const effCap = edge.baseCapacity * edge.reducedCapacityFactor;
          if (effCap <= 0) return Infinity;
          const occ = getOccupancy(state.congestion, edge.id);
          const ratio = Math.min(occ / effCap, 1.0);
          return baseLen * (1 + (state.config.congestionWeight * 0.5 + 0.5) * ratio * ratio);
        };
      default:
        return () => Infinity;
    }
  };

  const route = useMemo(() => {
    if (!originId || !destId || !state) return null;
    return shortestPath(state.graph, originId, destId, makeCostFn(strategy, accessibleOnly), accessibleOnly);
  }, [originId, destId, strategy, accessibleOnly, state, sim.step]);

  const comparison = useMemo(() => {
    if (!originId || !destId || !state) return [];
    const results: { strategy: string; cost: number; pathLength: number }[] = [];
    for (const strat of ['shortest', 'congestion-aware', 'balanced'] as const) {
      const r = shortestPath(state.graph, originId, destId, makeCostFn(strat, accessibleOnly), accessibleOnly);
      results.push({ strategy: strat, cost: r.cost, pathLength: r.path.length });
    }
    return results;
  }, [originId, destId, accessibleOnly, state, sim.step]);

  if (!state) return null;

  return (
    <div className="bg-ink-800/50 rounded-lg border border-ink-700 p-3 space-y-3">
      <div className="text-[10px] text-ink-400 font-mono">ROUTE INSPECTOR</div>

      <div className="space-y-2">
        <div>
          <div className="text-[9px] text-ink-400 mb-0.5">Origin</div>
          <select
            value={originId}
            onChange={(e) => setOriginId(e.target.value)}
            className="w-full bg-ink-700 border border-ink-600 rounded-md px-2 py-1.5 text-xs text-ink-200"
          >
            <option value="">Select origin...</option>
            {entrances.map(n => (
              <option key={n.id} value={n.id}>{n.label} ({n.type})</option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[9px] text-ink-400 mb-0.5">Destination</div>
          <select
            value={destId}
            onChange={(e) => setDestId(e.target.value)}
            className="w-full bg-ink-700 border border-ink-600 rounded-md px-2 py-1.5 text-xs text-ink-200"
          >
            <option value="">Select destination...</option>
            {destinations.map(n => (
              <option key={n.id} value={n.id}>{n.label} ({n.type})</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {(['shortest', 'congestion-aware', 'balanced'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStrategy(s)}
            className={`text-[10px] px-2 py-1.5 rounded-md transition-colors ${
              strategy === s
                ? 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/50'
                : 'bg-ink-700 text-ink-300 border border-transparent hover:bg-ink-600'
            }`}
          >
            {s === 'shortest' ? 'Shortest' : s === 'congestion-aware' ? 'Congestion' : 'Balanced'}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-xs text-ink-300 cursor-pointer">
        <input
          type="checkbox"
          checked={accessibleOnly}
          onChange={(e) => setAccessibleOnly(e.target.checked)}
          className="accent-accent-400"
        />
        Accessible paths only
      </label>

      {route && route.path.length > 0 && (
        <div className="bg-ink-900/50 rounded-md p-2 border border-ink-700/50">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1">
              <Route className="w-3 h-3 text-cyan-400" />
              <span className="text-[10px] text-ink-400">Route Found</span>
            </div>
            <span className="text-[10px] font-mono text-cyan-300">cost: {route.cost.toFixed(1)}</span>
          </div>
          <div className="flex flex-wrap gap-1 text-[10px] font-mono">
            {route.path.map((nodeId, i) => {
              const node = state.graph.nodes.get(nodeId);
              return (
                <span key={i} className="px-1.5 py-0.5 rounded bg-ink-700 text-ink-300">
                  {node?.label || nodeId}
                </span>
              );
            })}
          </div>
          <div className="text-[10px] text-ink-500 mt-1.5">
            {route.path.length} nodes | {route.edges.length} edges | est. cost {route.cost.toFixed(2)}
          </div>
        </div>
      )}

      {route && route.path.length === 0 && (
        <div className="bg-crimson-400/10 rounded-md p-2 border border-crimson-400/30">
          <div className="flex items-center gap-1.5">
            <Info className="w-3 h-3 text-crimson-400" />
            <span className="text-xs text-crimson-300">No feasible route exists for this configuration.</span>
          </div>
          {accessibleOnly && (
            <p className="text-[10px] text-crimson-400/70 mt-1">
              The destination may not be reachable using accessible paths only.
            </p>
          )}
        </div>
      )}

      {comparison.length > 0 && (
        <div>
          <div className="text-[9px] text-ink-400 mb-1">STRATEGY COMPARISON</div>
          <div className="space-y-1">
            {comparison.map(c => (
              <div key={c.strategy} className="flex items-center justify-between bg-ink-900/50 rounded-md px-2 py-1 text-[10px]">
                <span className="text-ink-300 capitalize">{c.strategy.replace('-', ' ')}</span>
                <div className="flex items-center gap-2">
                  <span className={`font-mono ${c.cost === Infinity ? 'text-crimson-400' : 'text-ink-200'}`}>
                    {c.cost === Infinity ? 'no route' : c.cost.toFixed(1)}
                  </span>
                  <span className="text-ink-500 font-mono">{c.pathLength}h</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[9px] text-ink-500 italic">
        Edge cost = base length × (1 + congestionWeight × (occupancy/capacity)²). Congestion-aware routes account for current edge occupancy.
      </p>
    </div>
  );
}
