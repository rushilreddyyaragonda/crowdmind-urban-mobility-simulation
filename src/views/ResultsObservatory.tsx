import { useMemo, useState } from 'react';
import {
  BarChart3, TrendingUp, Clock, Users, Activity, Download,
  AlertTriangle, CheckCircle2, Info, FileJson, FileText,
} from 'lucide-react';
import type { SimulationHandle } from '../hooks/useSimulation';
import type { Scenario, SimulationSnapshot, AgentHistoryRecord, SimulationEvent } from '../engine/types';
import { exportRunJSON, exportRunMarkdown, downloadFile, generateRunId, saveRun } from '../utils/storage';
import { APP_VERSION } from '../engine/city';
import { PROFILE_LABELS } from '../engine/city';

interface Props {
  sim: SimulationHandle;
  scenario: Scenario | null;
}

export default function ResultsObservatory({ sim, scenario }: Props) {
  const [tab, setTab] = useState<'timeline' | 'heatmap' | 'routes' | 'agents' | 'events' | 'regional'>('timeline');
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);

  const snapshot = sim.getSnapshot();
  const hasData = sim.snapshots.length > 0;
  const hasCompleted = (snapshot?.completedAgents ?? 0) > 0;

  const handleSave = async () => {
    if (!sim.state || !sim.config) return;
    const run = {
      id: generateRunId(),
      scenarioId: sim.currentScenarioId || 'custom',
      config: JSON.parse(JSON.stringify(sim.config)),
      network: JSON.parse(JSON.stringify(sim.currentNetwork || sim.state.network)),
      disruptions: JSON.parse(JSON.stringify(sim.currentDisruptions)),
      snapshots: [...sim.snapshots],
      agentHistories: [...sim.agentHistories],
      events: sim.events.slice(-200),
      startTime: Date.now(),
      endTime: Date.now(),
      status: 'completed' as const,
      seed: sim.config.seed,
      version: APP_VERSION,
    };
    await saveRun(run);
    alert('Run saved to Experiment Studio.');
  };

  const handleExportJSON = () => {
    if (!sim.state || !sim.config) return;
    const run = {
      id: generateRunId(),
      scenarioId: sim.currentScenarioId || 'custom',
      config: sim.config,
      network: sim.currentNetwork || sim.state.network,
      disruptions: sim.currentDisruptions,
      snapshots: sim.snapshots,
      agentHistories: sim.agentHistories,
      events: sim.events.slice(-200),
      startTime: Date.now(),
      endTime: null as number | null,
      status: 'completed' as const,
      seed: sim.config.seed,
      version: APP_VERSION,
    };
    downloadFile(`crowdmind-results-${run.id}.json`, exportRunJSON(run), 'application/json');
  };

  const handleExportMarkdown = () => {
    if (!sim.state || !sim.config) return;
    const run = {
      id: generateRunId(),
      scenarioId: sim.currentScenarioId || 'custom',
      config: sim.config,
      network: sim.currentNetwork || sim.state.network,
      disruptions: sim.currentDisruptions,
      snapshots: sim.snapshots,
      agentHistories: sim.agentHistories,
      events: sim.events.slice(-200),
      startTime: Date.now(),
      endTime: null as number | null,
      status: 'completed' as const,
      seed: sim.config.seed,
      version: APP_VERSION,
    };
    downloadFile(`crowdmind-results-${run.id}.md`, exportRunMarkdown(run), 'text/markdown');
  };

  return (
    <div className="h-full overflow-y-auto bg-ink-950">
      <div className="max-w-6xl mx-auto p-4 lg:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-accent-300" />
            <h1 className="text-xl font-semibold">Results Observatory</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={!sim.state} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-400/20 border border-accent-400/50 text-accent-300 rounded-lg text-xs hover:bg-accent-400/30 transition-colors disabled:opacity-40">
              <CheckCircle2 className="w-3.5 h-3.5" /> Save Run
            </button>
            <button onClick={handleExportJSON} disabled={!sim.state} className="flex items-center gap-1.5 px-3 py-1.5 bg-ink-800 border border-ink-700 text-ink-300 rounded-lg text-xs hover:bg-ink-700 transition-colors disabled:opacity-40">
              <FileJson className="w-3.5 h-3.5" /> JSON
            </button>
            <button onClick={handleExportMarkdown} disabled={!sim.state} className="flex items-center gap-1.5 px-3 py-1.5 bg-ink-800 border border-ink-700 text-ink-300 rounded-lg text-xs hover:bg-ink-700 transition-colors disabled:opacity-40">
              <FileText className="w-3.5 h-3.5" /> Markdown
            </button>
          </div>
        </div>

        {!hasData ? (
          <div className="bg-ink-900 border border-ink-700 rounded-xl p-8 text-center">
            <BarChart3 className="w-10 h-10 text-ink-600 mx-auto mb-3" />
            <p className="text-sm text-ink-400">No simulation data yet. Start a simulation in the Simulation Lab to see results here.</p>
          </div>
        ) : (
          <>
            {/* Summary metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <SummaryCard label="Completed" value={snapshot?.completedAgents ?? 0} icon={CheckCircle2} color="text-accent-300" />
              <SummaryCard label="Stranded" value={snapshot?.strandedAgents ?? 0} icon={AlertTriangle} color="text-crimson-400" />
              <SummaryCard label="Avg Travel" value={hasCompleted ? (snapshot?.avgTravelTime ?? 0).toFixed(1) : '—'} icon={Clock} color="text-ink-200" />
              <SummaryCard label="Completion" value={`${((snapshot?.completionRate ?? 0) * 100).toFixed(1)}%`} icon={TrendingUp} color="text-cyan-400" />
              <SummaryCard label="Net Util" value={`${((snapshot?.networkUtilization ?? 0) * 100).toFixed(1)}%`} icon={Activity} color="text-amber-400" />
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-1 border-b border-ink-700 overflow-x-auto">
              {([
                { id: 'timeline', label: 'Metric Timeline' },
                { id: 'heatmap', label: 'Congestion Heatmap' },
                { id: 'routes', label: 'Route Distribution' },
                { id: 'agents', label: 'Agent Journeys' },
                { id: 'events', label: 'Disruption Timeline' },
                { id: 'regional', label: 'Regional' },
              ] as const).map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
                    tab === t.id ? 'border-accent-400 text-accent-300' : 'border-transparent text-ink-400 hover:text-ink-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === 'timeline' && <TimelineView snapshots={sim.snapshots} />}
            {tab === 'heatmap' && <HeatmapView sim={sim} />}
            {tab === 'routes' && <RouteDistributionView sim={sim} />}
            {tab === 'agents' && <AgentJourneysView histories={sim.agentHistories} sim={sim} selectedAgent={selectedAgent} onSelectAgent={setSelectedAgent} />}
            {tab === 'events' && <EventTimelineView events={sim.events} disruptions={sim.currentDisruptions} />}
            {tab === 'regional' && <RegionalView sim={sim} />}

            {/* Metric definitions */}
            <div className="bg-ink-900 border border-ink-700 rounded-xl p-4">
              <div className="text-[10px] text-ink-400 font-mono mb-2">METRIC DEFINITIONS</div>
              <div className="space-y-1.5 text-xs text-ink-400">
                <div><strong className="text-ink-200">Avg Travel Time:</strong> Mean elapsed simulated time for agents that reached destinations. Shows count used.</div>
                <div><strong className="text-ink-200">Median Travel Time:</strong> Median completed-agent travel time, reducing sensitivity to outliers.</div>
                <div><strong className="text-ink-200">Completion Rate:</strong> Percentage of generated agents reaching destinations within the evaluation window.</div>
                <div><strong className="text-ink-200">Total Wait Time:</strong> Cumulative time agents spend waiting due to congestion or unavailable paths.</div>
                <div><strong className="text-ink-200">Congestion Exposure:</strong> Time agents spend on edges above 70% occupancy-to-capacity ratio.</div>
                <div><strong className="text-ink-200">Throughput:</strong> Agents completing journeys per simulated time unit.</div>
                <div><strong className="text-ink-200">Network Utilization:</strong> Average occupancy-to-capacity ratio across all open edges.</div>
                <div><strong className="text-ink-200">Stranded:</strong> Agents that cannot reach destinations via any feasible route.</div>
              </div>
              <p className="text-[10px] text-ink-500 italic mt-2">
                If no agents have completed a journey, averages show "—" rather than a misleading value. All metrics derive from actual simulation data.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: typeof Clock; color: string }) {
  return (
    <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[10px] text-ink-400">{label}</span>
      </div>
      <div className={`text-lg font-mono font-medium ${color}`}>{value}</div>
    </div>
  );
}

function TimelineView({ snapshots }: { snapshots: SimulationSnapshot[] }) {
  if (snapshots.length < 2) {
    return <EmptyState text="Not enough data points yet. Run the simulation longer to see metric evolution over time." />;
  }

  const metrics = [
    { key: 'avgTravelTime', label: 'Avg Travel Time', color: '#22d3ee' },
    { key: 'completionRate', label: 'Completion Rate', color: '#5eead4' },
    { key: 'queueSize', label: 'Queue Size', color: '#fbbf24' },
    { key: 'throughput', label: 'Throughput', color: '#f59e0b' },
    { key: 'networkUtilization', label: 'Network Utilization', color: '#ef4444' },
    { key: 'activeAgents', label: 'Active Agents', color: '#8a9ab5' },
  ] as const;

  return (
    <div className="space-y-3">
      {metrics.map(m => {
        const values = snapshots.map(s => (s as any)[m.key] as number);
        const maxVal = Math.max(...values, 0.01);
        const minVal = Math.min(...values, 0);
        const range = maxVal - minVal || 1;
        return (
          <div key={m.key} className="bg-ink-900 border border-ink-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-ink-200">{m.label}</span>
              <span className="text-xs font-mono text-ink-400">
                current: {values[values.length - 1].toFixed(2)} | max: {maxVal.toFixed(2)}
              </span>
            </div>
            <svg viewBox={`0 0 ${snapshots.length * 4} 60`} className="w-full h-16" preserveAspectRatio="none">
              <polyline
                points={values.map((v, i) => `${i * 4},${60 - ((v - minVal) / range) * 55 - 2.5}`).join(' ')}
                fill="none"
                stroke={m.color}
                strokeWidth="1.5"
              />
              <polygon
                points={`0,60 ${values.map((v, i) => `${i * 4},${60 - ((v - minVal) / range) * 55 - 2.5}`).join(' ')} ${(snapshots.length - 1) * 4},60`}
                fill={m.color}
                opacity="0.1"
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

function HeatmapView({ sim }: { sim: SimulationHandle }) {
  if (!sim.state) return <EmptyState text="No simulation running." />;
  const edges = Array.from(sim.state.graph.edges.values());
  const nodes = Array.from(sim.state.graph.nodes.values());

  const occupancyMap = new Map<string, number>();
  for (const edge of edges) {
    const occ = sim.state.congestion.edgeOccupancy.get(edge.id) ?? 0;
    const cap = edge.baseCapacity * edge.reducedCapacityFactor;
    occupancyMap.set(edge.id, cap > 0 ? Math.min(occ / cap, 1) : 0);
  }

  const maxOcc = Math.max(...Array.from(occupancyMap.values()), 0.01);
  const sortedEdges = edges
    .map(e => ({ edge: e, occ: occupancyMap.get(e.id) ?? 0 }))
    .sort((a, b) => b.occ - a.occ);

  return (
    <div className="space-y-3">
      <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
        <div className="text-sm text-ink-200 mb-2">Edge Utilization Heatmap (sorted by congestion)</div>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {sortedEdges.map(({ edge, occ }) => {
            const from = nodes.find(n => n.id === edge.from);
            const to = nodes.find(n => n.id === edge.to);
            const pct = (occ * 100).toFixed(0);
            const color = occ > 0.7 ? '#ef4444' : occ > 0.4 ? '#fbbf24' : occ > 0.1 ? '#0e7490' : '#243049';
            return (
              <div key={edge.id} className="flex items-center gap-2 text-xs">
                <span className="text-ink-400 w-48 truncate">{from?.label} → {to?.label}</span>
                <div className="flex-1 h-4 bg-ink-800 rounded-sm overflow-hidden">
                  <div className="h-full rounded-sm transition-all" style={{ width: `${Math.max(occ * 100, 2)}%`, background: color }} />
                </div>
                <span className="text-ink-300 font-mono w-10 text-right">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RouteDistributionView({ sim }: { sim: SimulationHandle }) {
  if (!sim.state) return <EmptyState text="No simulation running." />;
  const state = sim.state;
  const histories = sim.agentHistories;
  if (histories.length === 0) return <EmptyState text="No completed agent journeys yet." />;

  // Count which edges were used
  const edgeUsage = new Map<string, number>();
  for (const h of histories) {
    for (let i = 0; i < h.routeUsed.length - 1; i++) {
      const from = h.routeUsed[i];
      const to = h.routeUsed[i + 1];
      const edge = Array.from(state.graph.edges.values()).find(
        e => (e.from === from && e.to === to) || (e.from === to && e.to === from && e.bidirectional)
      );
      if (edge) {
        edgeUsage.set(edge.id, (edgeUsage.get(edge.id) ?? 0) + 1);
      }
    }
  }

  const sorted = Array.from(edgeUsage.entries()).sort((a, b) => b[1] - a[1]);
  const maxUsage = sorted.length > 0 ? sorted[0][1] : 1;
  const nodes = Array.from(sim.state.graph.nodes.values());

  // Profile distribution
  const profileCounts = new Map<string, number>();
  for (const h of histories) {
    profileCounts.set(h.profile, (profileCounts.get(h.profile) ?? 0) + 1);
  }

  return (
    <div className="space-y-3">
      <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
        <div className="text-sm text-ink-200 mb-2">Edge Usage Distribution</div>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {sorted.slice(0, 30).map(([edgeId, count]) => {
            const edge = state.graph.edges.get(edgeId);
            if (!edge) return null;
            const from = nodes.find(n => n.id === edge.from);
            const to = nodes.find(n => n.id === edge.to);
            return (
              <div key={edgeId} className="flex items-center gap-2 text-xs">
                <span className="text-ink-400 w-48 truncate">{from?.label} → {to?.label}</span>
                <div className="flex-1 h-4 bg-ink-800 rounded-sm overflow-hidden">
                  <div className="h-full bg-cyan-400 rounded-sm" style={{ width: `${(count / maxUsage) * 100}%` }} />
                </div>
                <span className="text-ink-300 font-mono w-8 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
        <div className="text-sm text-ink-200 mb-2">Agent Profile Distribution</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Array.from(profileCounts.entries()).map(([profile, count]) => (
            <div key={profile} className="bg-ink-800/50 rounded-md p-2">
              <div className="text-[10px] text-ink-400">{PROFILE_LABELS[profile] || profile}</div>
              <div className="text-lg font-mono text-ink-200">{count}</div>
              <div className="text-[10px] text-ink-500">{((count / histories.length) * 100).toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentJourneysView({ histories, sim, selectedAgent, onSelectAgent }: {
  histories: AgentHistoryRecord[];
  sim: SimulationHandle;
  selectedAgent: number | null;
  onSelectAgent: (id: number) => void;
}) {
  if (histories.length === 0) return <EmptyState text="No archived agent journeys yet. Agents are archived after reaching their destinations." />;

  const sorted = [...histories].sort((a, b) => (b.travelTime ?? 9999) - (a.travelTime ?? 9999));
  const selected = selectedAgent !== null ? histories.find(h => h.id === selectedAgent) : null;

  return (
    <div className="space-y-3">
      <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
        <div className="text-sm text-ink-200 mb-2">Agent Journey Inspector — {histories.length} archived</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="max-h-80 overflow-y-auto space-y-1">
            {sorted.slice(0, 50).map(h => {
              const origin = sim.state?.graph.nodes.get(h.originNodeId);
              const dest = sim.state?.graph.nodes.get(h.destinationNodeId);
              return (
                <button
                  key={h.id}
                  onClick={() => onSelectAgent(h.id)}
                  className={`w-full text-left p-2 rounded-md text-xs transition-colors ${
                    selectedAgent === h.id ? 'bg-accent-400/10 border border-accent-400/30' : 'bg-ink-800/50 border border-transparent hover:bg-ink-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-ink-300">#{h.id}</span>
                    <span className="text-ink-500">{PROFILE_LABELS[h.profile]}</span>
                  </div>
                  <div className="text-ink-400 text-[10px] mt-0.5">
                    {origin?.label} → {dest?.label}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] mt-0.5">
                    <span className={h.travelTime !== null ? 'text-cyan-400' : 'text-crimson-400'}>
                      t={h.travelTime?.toFixed(1) ?? 'N/A'}
                    </span>
                    <span className="text-amber-400">wait={h.waitTime.toFixed(1)}</span>
                    <span className="text-ink-500">dist={h.distanceTraveled.toFixed(0)}</span>
                    {h.rerouteCount > 0 && <span className="text-accent-300">rerouted ×{h.rerouteCount}</span>}
                  </div>
                </button>
              );
            })}
          </div>
          {selected && (
            <div className="bg-ink-800/50 rounded-md p-3 border border-ink-700">
              <div className="text-sm font-medium text-ink-200 mb-2">Agent #{selected.id} Details</div>
              <div className="space-y-1.5 text-xs">
                <Row label="Profile" value={PROFILE_LABELS[selected.profile]} />
                <Row label="Origin" value={sim.state?.graph.nodes.get(selected.originNodeId)?.label || selected.originNodeId} />
                <Row label="Destination" value={sim.state?.graph.nodes.get(selected.destinationNodeId)?.label || selected.destinationNodeId} />
                <Row label="Travel Time" value={selected.travelTime?.toFixed(2) + ' sim sec' || 'Did not arrive'} />
                <Row label="Distance" value={selected.distanceTraveled.toFixed(1)} />
                <Row label="Wait Time" value={selected.waitTime.toFixed(1) + ' sim sec'} />
                <Row label="Congestion Exposure" value={selected.congestionExposure.toFixed(1) + ' sim sec'} />
                <Row label="Reroutes" value={selected.rerouteCount.toString()} />
                <Row label="Final State" value={selected.state} />
              </div>
              <div className="mt-2 pt-2 border-t border-ink-700">
                <div className="text-[10px] text-ink-400 mb-1">Route Taken ({selected.routeUsed.length} nodes)</div>
                <div className="flex flex-wrap gap-1 text-[10px] font-mono max-h-32 overflow-y-auto">
                  {selected.routeUsed.map((nodeId, i) => {
                    const n = sim.state?.graph.nodes.get(nodeId);
                    return <span key={i} className="px-1 py-0.5 rounded bg-ink-700 text-ink-300">{n?.label || nodeId}</span>;
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Outliers */}
      <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
        <div className="text-sm text-ink-200 mb-2">Outlier Investigation</div>
        <p className="text-xs text-ink-400 mb-2">Agents with unusually long travel times or incomplete journeys.</p>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {sorted.filter(h => h.travelTime === null || (h.travelTime > (sorted.find(x => x.travelTime !== null)?.travelTime ?? 100) * 2)).slice(0, 10).map(h => {
            const origin = sim.state?.graph.nodes.get(h.originNodeId);
            const dest = sim.state?.graph.nodes.get(h.destinationNodeId);
            return (
              <div key={h.id} className="flex items-center justify-between bg-ink-800/50 rounded-md px-2 py-1 text-xs">
                <span className="font-mono text-ink-300">#{h.id}</span>
                <span className="text-ink-400 truncate mx-2">{origin?.label} → {dest?.label}</span>
                <span className={h.travelTime === null ? 'text-crimson-400' : 'text-amber-400'}>
                  {h.travelTime === null ? 'Did not arrive' : `t=${h.travelTime.toFixed(1)}`}
                </span>
                <span className="text-ink-500 ml-2">{h.state}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EventTimelineView({ events, disruptions }: { events: SimulationEvent[]; disruptions: any[] }) {
  const disruptionEvents = events.filter(e => e.type === 'disruption-start' || e.type === 'disruption-end' || e.type === 'stranded' || e.type === 'reroute');

  return (
    <div className="space-y-3">
      <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
        <div className="text-sm text-ink-200 mb-2">Disruption Timeline</div>
        {disruptions.length === 0 ? (
          <p className="text-xs text-ink-400">No disruptions configured.</p>
        ) : (
          <div className="space-y-2">
            {disruptions.map(d => (
              <div key={d.id} className="flex items-center gap-3 text-xs">
                <div className={`w-2 h-2 rounded-full ${d.active ? 'bg-crimson-400 pulse-glow' : d.applied ? 'bg-ink-600' : 'bg-amber-400'}`} />
                <span className="text-ink-200 flex-1 truncate">{d.label}</span>
                <span className="text-ink-500 font-mono">t={d.startTime}</span>
                {d.duration > 0 && <span className="text-ink-500 font-mono">dur={d.duration}</span>}
                <span className={d.active ? 'text-crimson-400' : d.applied ? 'text-ink-500' : 'text-amber-400'}>
                  {d.active ? 'ACTIVE' : d.applied ? 'ended' : 'pending'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-ink-900 border border-ink-700 rounded-lg p-3">
        <div className="text-sm text-ink-200 mb-2">Event Log (recent {Math.min(disruptionEvents.length, 50)} of {disruptionEvents.length})</div>
        <div className="max-h-80 overflow-y-auto space-y-0.5">
          {disruptionEvents.slice(-50).reverse().map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-xs py-1 border-b border-ink-800/50">
              <span className="text-ink-500 font-mono text-[10px] mt-0.5">t={e.simTime.toFixed(1)}</span>
              <span className={`text-[10px] font-mono mt-0.5 ${
                e.type === 'disruption-start' ? 'text-crimson-400' :
                e.type === 'disruption-end' ? 'text-accent-300' :
                e.type === 'stranded' ? 'text-crimson-400' :
                'text-cyan-400'
              }`}>{e.type}</span>
              <span className="text-ink-300 flex-1">{e.description}</span>
            </div>
          ))}
          {disruptionEvents.length === 0 && <p className="text-xs text-ink-400">No disruption events recorded yet.</p>}
        </div>
      </div>
    </div>
  );
}

function RegionalView({ sim }: { sim: SimulationHandle }) {
  if (!sim.state) return <EmptyState text="No simulation running." />;
  const state = sim.state;
  const districts = state.network.districts || [];

  const districtStats = districts.map(d => {
    const districtNodes = Array.from(state.graph.nodes.values()).filter(n => n.district === d);
    const districtNodeIds = new Set(districtNodes.map(n => n.id));
    const districtEdges = Array.from(state.graph.edges.values()).filter(
      e => districtNodeIds.has(e.from) || districtNodeIds.has(e.to)
    );
    let activeAgents = 0;
    for (const [, agent] of state.agents) {
      for (const nodeId of districtNodeIds) {
        const node = state.graph.nodes.get(nodeId);
        if (node) {
          const dist = Math.hypot(agent.pos.x - node.pos.x, agent.pos.y - node.pos.y);
          if (dist < 80) { activeAgents++; break; }
        }
      }
    }
    const destinations = districtNodes.filter(n => n.type === 'destination').length;
    const entrances = districtNodes.filter(n => n.type === 'entrance').length;
    const hasDisruption = state.disruptions.some(dis => {
      if (dis.targetType === 'node') return districtNodeIds.has(dis.targetId) && dis.active;
      const e = state.graph.edges.get(dis.targetId);
      return e && (districtNodeIds.has(e.from) || districtNodeIds.has(e.to)) && dis.active;
    });

    let edgeUtil = 0;
    let count = 0;
    for (const edge of districtEdges) {
      if (edge.closed) continue;
      const occ = state.congestion.edgeOccupancy.get(edge.id) ?? 0;
      const cap = edge.baseCapacity * edge.reducedCapacityFactor;
      if (cap > 0) { edgeUtil += Math.min(occ / cap, 1); count++; }
    }
    edgeUtil = count > 0 ? edgeUtil / count : 0;

    return { district: d, activeAgents, destinations, entrances, hasDisruption, edgeUtil, nodeCount: districtNodes.length };
  });

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {districtStats.map(s => (
          <div key={s.district} className="bg-ink-900 border border-ink-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-ink-200">{s.district}</span>
              {s.hasDisruption && (
                <span className="text-[10px] text-crimson-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> disruption
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Row label="Nodes" value={s.nodeCount.toString()} />
              <Row label="Active" value={s.activeAgents.toString()} />
              <Row label="Entrances" value={s.entrances.toString()} />
              <Row label="Destinations" value={s.destinations.toString()} />
              <Row label="Util" value={(s.edgeUtil * 100).toFixed(0) + '%'} />
            </div>
            <div className="mt-2 h-2 bg-ink-800 rounded-sm overflow-hidden">
              <div
                className={`h-full rounded-sm ${s.edgeUtil > 0.7 ? 'bg-crimson-400' : s.edgeUtil > 0.4 ? 'bg-amber-400' : 'bg-cyan-400'}`}
                style={{ width: `${Math.max(s.edgeUtil * 100, 2)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-400">{label}</span>
      <span className="text-ink-200 font-mono">{value}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-ink-900 border border-ink-700 rounded-xl p-6 text-center">
      <Info className="w-8 h-8 text-ink-600 mx-auto mb-2" />
      <p className="text-sm text-ink-400">{text}</p>
    </div>
  );
}
