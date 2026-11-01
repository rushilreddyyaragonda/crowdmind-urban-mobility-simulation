import { useState, useEffect, useCallback } from 'react';
import {
  FlaskConical, Save, Copy, GitCompare, Trash2, Play, Download,
  CheckCircle2, AlertTriangle, FileText, FileJson,
} from 'lucide-react';
import type { SimulationHandle } from '../hooks/useSimulation';
import type { Scenario, SimulationRun, SimulationConfig, SimulationSnapshot } from '../engine/types';
import { generateRunId, saveRun, getAllRuns, deleteRun, exportRunJSON, exportRunMarkdown, downloadFile } from '../utils/storage';
import { APP_VERSION } from '../engine/city';

interface Props {
  sim: SimulationHandle;
  scenarios: Scenario[];
  currentScenario: Scenario | null;
}

export default function ExperimentStudio({ sim, scenarios, currentScenario }: Props) {
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [hypothesis, setHypothesis] = useState('');
  const [independentVar, setIndependentVar] = useState('');
  const [dependentVars, setDependentVars] = useState('');
  const [controlledVars, setControlledVars] = useState('');

  const loadRuns = useCallback(async () => {
    setLoading(true);
    const all = await getAllRuns();
    setRuns(all.sort((a, b) => b.startTime - a.startTime));
    setLoading(false);
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const saveCurrentRun = useCallback(async () => {
    if (!sim.state || !sim.config) return;
    const run: SimulationRun = {
      id: generateRunId(),
      scenarioId: sim.currentScenarioId || 'custom',
      config: JSON.parse(JSON.stringify(sim.config)),
      network: JSON.parse(JSON.stringify(sim.currentNetwork || sim.state.network)),
      disruptions: JSON.parse(JSON.stringify(sim.currentDisruptions)),
      snapshots: [...sim.snapshots],
      agentHistories: [...sim.agentHistories],
      events: sim.events.slice(-100),
      startTime: Date.now(),
      endTime: Date.now(),
      status: sim.running ? 'running' : 'completed',
      seed: sim.config.seed,
      version: APP_VERSION,
    };
    await saveRun(run);
    await loadRuns();
  }, [sim, loadRuns]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this saved run? This cannot be undone.')) return;
    await deleteRun(id);
    setSelectedIds(ids => ids.filter(x => x !== id));
    await loadRuns();
  }, [loadRuns]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }, []);

  const selectedRuns = runs.filter(r => selectedIds.includes(r.id));

  const handleExportJSON = (run: SimulationRun) => {
    downloadFile(`crowdmind-${run.scenarioId}-${run.id}.json`, exportRunJSON(run), 'application/json');
  };

  const handleExportMarkdown = (run: SimulationRun) => {
    downloadFile(`crowdmind-${run.scenarioId}-${run.id}.md`, exportRunMarkdown(run), 'text/markdown');
  };

  const handleExportCSV = () => {
    if (runs.length === 0) return;
    const headers = ['Run ID', 'Scenario', 'Seed', 'Routing', 'Agents', 'Completed', 'Stranded', 'Avg Travel', 'Median Travel', 'Completion %', 'Wait Time', 'Congestion Exp', 'Throughput', 'Net Util'];
    const rows = runs.map(r => {
      const last = r.snapshots.length > 0 ? r.snapshots[r.snapshots.length - 1] : null;
      return [r.id, r.scenarioId, r.seed, r.config.routingStrategy, r.config.agentCount,
        last?.completedAgents ?? 0, last?.strandedAgents ?? 0,
        last?.avgTravelTime?.toFixed(2) ?? '0', last?.medianTravelTime?.toFixed(2) ?? '0',
        ((last?.completionRate ?? 0) * 100).toFixed(1),
        last?.totalWaitTime?.toFixed(1) ?? '0', last?.congestionExposure?.toFixed(1) ?? '0',
        last?.throughput?.toFixed(4) ?? '0', ((last?.networkUtilization ?? 0) * 100).toFixed(1)];
    });
    downloadFile('crowdmind-experiments.csv', [headers, ...rows].map(r => r.join(',')).join('\n'), 'text/csv');
  };

  return (
    <div className="h-full overflow-y-auto bg-ink-950">
      <div className="max-w-6xl mx-auto p-4 lg:p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <FlaskConical className="w-5 h-5 text-accent-300" />
          <h1 className="text-xl font-semibold">Experiment Studio</h1>
        </div>
        <p className="text-sm text-ink-400 mb-4">
          Formulate a hypothesis, save baseline and intervention runs, then compare outcomes. Every run records its configuration, seed, and metrics for reproducibility.
        </p>

        {/* Hypothesis builder */}
        <div className="bg-ink-900 border border-ink-700 rounded-xl p-4 space-y-3">
          <div className="text-[10px] text-ink-400 font-mono">RESEARCH QUESTION BUILDER</div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-300 block mb-1">Hypothesis</label>
              <textarea
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                placeholder="e.g. Adding an alternative route will reduce waiting time at the affected bottleneck..."
                className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-sm text-ink-200 resize-none"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-ink-300 block mb-1">Independent Variable</label>
                <input
                  value={independentVar}
                  onChange={(e) => setIndependentVar(e.target.value)}
                  placeholder="e.g. Availability of alternative route"
                  className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-sm text-ink-200"
                />
              </div>
              <div>
                <label className="text-xs text-ink-300 block mb-1">Dependent Variables</label>
                <input
                  value={dependentVars}
                  onChange={(e) => setDependentVars(e.target.value)}
                  placeholder="e.g. Waiting time, completion rate"
                  className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-sm text-ink-200"
                />
              </div>
              <div>
                <label className="text-xs text-ink-300 block mb-1">Controlled Variables</label>
                <input
                  value={controlledVars}
                  onChange={(e) => setControlledVars(e.target.value)}
                  placeholder="e.g. Population, seed, routing strategy"
                  className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-sm text-ink-200"
                />
              </div>
            </div>
          </div>
          <p className="text-[10px] text-ink-500 italic">
            Do not claim a difference was caused by one variable if several uncontrolled variables changed. Label experiments accordingly.
          </p>
        </div>

        {/* Save current run */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={saveCurrentRun}
            disabled={!sim.state}
            className="flex items-center gap-2 px-4 py-2 bg-accent-400/20 border border-accent-400/50 text-accent-300 rounded-lg text-sm hover:bg-accent-400/30 transition-colors disabled:opacity-40"
          >
            <Save className="w-4 h-4" />
            Save Current Run
          </button>
          <button
            onClick={handleExportCSV}
            disabled={runs.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-ink-800 border border-ink-700 text-ink-300 rounded-lg text-sm hover:bg-ink-700 transition-colors disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            Export All CSV
          </button>
          <span className="text-xs text-ink-500 ml-auto">{runs.length} saved runs</span>
        </div>

        {/* Saved runs list */}
        <div className="bg-ink-900 border border-ink-700 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-ink-700 flex items-center justify-between">
            <span className="text-[10px] text-ink-400 font-mono">SAVED EXPERIMENTS</span>
            {selectedIds.length >= 2 && (
              <span className="text-xs text-accent-300">{selectedIds.length} selected for comparison</span>
            )}
          </div>
          {loading ? (
            <div className="p-4 text-sm text-ink-400">Loading...</div>
          ) : runs.length === 0 ? (
            <div className="p-6 text-center">
              <FlaskConical className="w-8 h-8 text-ink-600 mx-auto mb-2" />
              <p className="text-sm text-ink-400">No saved experiments yet. Run a simulation and save it to start comparing.</p>
            </div>
          ) : (
            <div className="divide-y divide-ink-800">
              {runs.map(run => {
                const last = run.snapshots.length > 0 ? run.snapshots[run.snapshots.length - 1] : null;
                const isSelected = selectedIds.includes(run.id);
                return (
                  <div key={run.id} className={`p-3 flex items-center gap-3 hover:bg-ink-800/50 transition-colors ${isSelected ? 'bg-accent-400/5' : ''}`}>
                    <button
                      onClick={() => toggleSelect(run.id)}
                      className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected ? 'bg-accent-400 border-accent-400' : 'border-ink-600 hover:border-ink-400'
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="w-3 h-3 text-ink-950" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink-200 truncate">
                        {run.scenarioId} <span className="text-ink-500 font-mono text-xs">seed:{run.seed}</span>
                      </div>
                      <div className="text-[10px] text-ink-500 font-mono">
                        {new Date(run.startTime).toLocaleString()} · {run.config.routingStrategy} · {run.config.agentCount} agents
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-4 text-xs font-mono">
                      {last && (
                        <>
                          <Metric label="completed" value={last.completedAgents} />
                          <Metric label="avg.t" value={last.avgTravelTime.toFixed(1)} />
                          <Metric label="comp%" value={(last.completionRate * 100).toFixed(0) + '%'} />
                          <Metric label="wait" value={last.totalWaitTime.toFixed(0)} />
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleExportJSON(run)} className="p-1.5 text-ink-400 hover:text-accent-300 transition-colors" title="Export JSON">
                        <FileJson className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleExportMarkdown(run)} className="p-1.5 text-ink-400 hover:text-accent-300 transition-colors" title="Export Markdown">
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(run.id)} className="p-1.5 text-ink-400 hover:text-crimson-400 transition-colors" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Comparison */}
        {selectedRuns.length >= 2 && (
          <ComparisonEngine runs={selectedRuns} />
        )}

        {/* Example experiments */}
        <div className="bg-ink-900 border border-ink-700 rounded-xl p-4">
          <div className="text-[10px] text-ink-400 font-mono mb-2">EXAMPLE EXPERIMENTS</div>
          <div className="space-y-2">
            {[
              { title: 'Does another exit always help?', desc: 'Compare baseline with a city that has an additional exit. Measure travel time, congestion, stranded agents.' },
              { title: 'Shortest path vs congestion-aware routing', desc: 'Keep city and population fixed, change only the routing strategy.' },
              { title: 'The cost of a single closure', desc: 'Close a critical passage and compare against the unchanged network.' },
              { title: 'How much redundancy is enough?', desc: 'Introduce alternative connections and investigate whether they reduce disruption impact.' },
              { title: 'Unequal access to safe routes', desc: 'Investigate whether accessibility-conscious agents experience longer journeys.' },
              { title: 'Demand surge', desc: 'Increase arrivals at a particular entrance and compare under different capacity configurations.' },
            ].map((exp, i) => (
              <div key={i} className="bg-ink-800/50 rounded-lg p-2.5 border border-ink-700/50">
                <div className="text-sm font-medium text-ink-200">{exp.title}</div>
                <div className="text-xs text-ink-400 mt-0.5">{exp.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-ink-200">{value}</span>
      <span className="text-[8px] text-ink-500">{label}</span>
    </div>
  );
}

function ComparisonEngine({ runs }: { runs: SimulationRun[] }) {
  const metrics: { key: string; label: string; get: (s: SimulationSnapshot) => number; lowerBetter: boolean }[] = [
    { key: 'completedAgents', label: 'Completed', get: s => s.completedAgents, lowerBetter: false },
    { key: 'avgTravelTime', label: 'Avg Travel Time', get: s => s.avgTravelTime, lowerBetter: true },
    { key: 'medianTravelTime', label: 'Median Travel', get: s => s.medianTravelTime, lowerBetter: true },
    { key: 'completionRate', label: 'Completion %', get: s => s.completionRate * 100, lowerBetter: false },
    { key: 'totalWaitTime', label: 'Total Wait', get: s => s.totalWaitTime, lowerBetter: true },
    { key: 'congestionExposure', label: 'Congestion Exp.', get: s => s.congestionExposure, lowerBetter: true },
    { key: 'throughput', label: 'Throughput', get: s => s.throughput, lowerBetter: false },
    { key: 'networkUtilization', label: 'Net Util %', get: s => s.networkUtilization * 100, lowerBetter: true },
    { key: 'strandedAgents', label: 'Stranded', get: s => s.strandedAgents, lowerBetter: true },
  ];

  const getLast = (run: SimulationRun): SimulationSnapshot | null => {
    return run.snapshots.length > 0 ? run.snapshots[run.snapshots.length - 1] : null;
  };

  const lastSnapshots = runs.map(getLast);
  const baseline = lastSnapshots[0];

  // Find differing config parameters
  const configKeys = ['routingStrategy', 'agentCount', 'spawnRate', 'congestionWeight', 'seed'] as const;
  const differingParams: string[] = [];
  if (runs.length >= 2) {
    const c0 = runs[0].config;
    for (const key of configKeys) {
      for (let i = 1; i < runs.length; i++) {
        if ((runs[i].config as any)[key] !== (c0 as any)[key]) {
          differingParams.push(key);
          break;
        }
      }
    }
    // Check profile distribution
    const pd0 = JSON.stringify(runs[0].config.profileDistribution);
    if (runs.some(r => JSON.stringify(r.config.profileDistribution) !== pd0)) {
      differingParams.push('profileDistribution');
    }
  }

  return (
    <div className="bg-ink-900 border border-accent-400/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GitCompare className="w-4 h-4 text-accent-300" />
        <span className="text-sm font-medium text-accent-300">Comparison Engine</span>
      </div>

      {differingParams.length > 0 && (
        <div className="bg-amber-400/10 border border-amber-400/20 rounded-lg p-2 text-xs text-amber-300">
          <strong>Changed parameters:</strong> {differingParams.join(', ')}
          {differingParams.length > 1 && (
            <span className="block mt-0.5 text-amber-400/70">
              Warning: Multiple variables changed. Cannot attribute differences to a single cause.
            </span>
          )}
        </div>
      )}
      {differingParams.length === 0 && runs.length >= 2 && (
        <div className="text-xs text-ink-400">
          All configurations are identical. Runs differ only in stochastic outcomes (if any).
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ink-700">
              <th className="text-left py-2 px-2 text-ink-400 font-medium">Metric</th>
              {runs.map((r, i) => (
                <th key={r.id} className="text-right py-2 px-2 text-ink-300 font-mono">
                  Run {i + 1}
                  <div className="text-[9px] text-ink-500 font-normal">{r.scenarioId}</div>
                </th>
              ))}
              {baseline && runs.length === 2 && (
                <th className="text-right py-2 px-2 text-ink-400">Diff</th>
              )}
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => {
              const values = lastSnapshots.map(s => s ? m.get(s) : 0);
              const hasData = lastSnapshots.some(s => s && s.completedAgents > 0);
              if (!hasData && m.key !== 'strandedAgents' && m.key !== 'completedAgents') {
                return (
                  <tr key={m.key} className="border-b border-ink-800">
                    <td className="py-1.5 px-2 text-ink-400">{m.label}</td>
                    {runs.map((_, i) => <td key={i} className="text-right py-1.5 px-2 text-ink-600 font-mono">—</td>)}
                    {runs.length === 2 && <td className="text-right py-1.5 px-2 text-ink-600">—</td>}
                  </tr>
                );
              }
              const diff = runs.length === 2 && values[0] !== 0 ? ((values[1] - values[0]) / Math.abs(values[0]) * 100) : null;
              const improved = diff !== null ? (m.lowerBetter ? diff < 0 : diff > 0) : false;
              return (
                <tr key={m.key} className="border-b border-ink-800">
                  <td className="py-1.5 px-2 text-ink-300">{m.label}</td>
                  {values.map((v, i) => (
                    <td key={i} className="text-right py-1.5 px-2 font-mono text-ink-200">
                      {m.key === 'completionRate' || m.key === 'networkUtilization' ? v.toFixed(1) : v.toFixed(2)}
                    </td>
                  ))}
                  {diff !== null && (
                    <td className={`text-right py-1.5 px-2 font-mono ${improved ? 'text-accent-300' : 'text-crimson-400'}`}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                      <span className="text-[8px] block">{improved ? 'better' : 'worse'}</span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-ink-500 italic">
        Direction of improvement: lower is better for travel time, wait time, congestion, utilization, stranded. Higher is better for completed, completion rate, throughput.
        Do not claim statistical significance from a single pair of runs.
      </div>
    </div>
  );
}
