import type { SimulationHandle } from '../hooks/useSimulation';
import type { SimulationSnapshot } from '../engine/types';
import {
  TrendingUp, Clock, Users, CheckCircle2, AlertTriangle,
  Gauge, Route, Zap, Activity,
} from 'lucide-react';

interface Props {
  sim: SimulationHandle;
  snapshot: SimulationSnapshot | null;
}

export default function MetricsPanel({ sim, snapshot }: Props) {
  if (!snapshot) {
    return (
      <div className="bg-ink-800/50 rounded-lg border border-ink-700 p-3">
        <p className="text-xs text-ink-400">No simulation running.</p>
      </div>
    );
  }

  const metrics = [
    {
      label: 'Completed',
      value: snapshot.completedAgents.toString(),
      sub: `${sim.agentHistories.length} archived`,
      icon: CheckCircle2,
      color: 'text-accent-300',
    },
    {
      label: 'Active',
      value: snapshot.activeAgents.toString(),
      sub: `${snapshot.strandedAgents} stranded`,
      icon: Users,
      color: 'text-cyan-400',
    },
    {
      label: 'Avg Travel Time',
      value: snapshot.avgTravelTime > 0 ? snapshot.avgTravelTime.toFixed(1) : '—',
      sub: snapshot.completedAgents > 0 ? 'sim seconds' : 'no completions yet',
      icon: Clock,
      color: 'text-ink-200',
    },
    {
      label: 'Median Travel',
      value: snapshot.medianTravelTime > 0 ? snapshot.medianTravelTime.toFixed(1) : '—',
      sub: 'sim seconds',
      icon: TrendingUp,
      color: 'text-ink-200',
    },
    {
      label: 'Completion Rate',
      value: `${(snapshot.completionRate * 100).toFixed(1)}%`,
      sub: `${snapshot.completedAgents}/${sim.step > 0 ? Math.max(snapshot.completedAgents + snapshot.activeAgents + snapshot.strandedAgents, 1) : 0}`,
      icon: Gauge,
      color: snapshot.completionRate > 0.8 ? 'text-accent-300' : snapshot.completionRate > 0.5 ? 'text-amber-400' : 'text-crimson-400',
    },
    {
      label: 'Queue Size',
      value: snapshot.queueSize.toString(),
      sub: 'waiting agents',
      icon: AlertTriangle,
      color: snapshot.queueSize > 10 ? 'text-crimson-400' : snapshot.queueSize > 3 ? 'text-amber-400' : 'text-ink-200',
    },
    {
      label: 'Throughput',
      value: snapshot.throughput > 0 ? snapshot.throughput.toFixed(3) : '—',
      sub: 'agents/sim sec',
      icon: Zap,
      color: 'text-cyan-400',
    },
    {
      label: 'Net Utilization',
      value: `${(snapshot.networkUtilization * 100).toFixed(1)}%`,
      sub: 'of capacity',
      icon: Activity,
      color: snapshot.networkUtilization > 0.7 ? 'text-crimson-400' : snapshot.networkUtilization > 0.4 ? 'text-amber-400' : 'text-accent-300',
    },
    {
      label: 'Congestion Exp.',
      value: snapshot.congestionExposure > 0 ? snapshot.congestionExposure.toFixed(1) : '0',
      sub: 'sim seconds',
      icon: Route,
      color: 'text-amber-400',
    },
    {
      label: 'Total Wait',
      value: snapshot.totalWaitTime > 0 ? snapshot.totalWaitTime.toFixed(1) : '0',
      sub: 'sim seconds',
      icon: Clock,
      color: 'text-amber-400',
    },
  ];

  return (
    <div className="bg-ink-800/50 rounded-lg border border-ink-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-ink-400 font-mono">PERFORMANCE METRICS</div>
        <div className={`flex items-center gap-1 text-[10px] ${sim.running ? 'text-accent-300' : 'text-ink-500'}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${sim.running ? 'bg-accent-400 pulse-glow' : 'bg-ink-600'}`} />
          {sim.running ? 'LIVE' : 'PAUSED'}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {metrics.map(m => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="bg-ink-900/50 rounded-md p-2 border border-ink-700/50">
              <div className="flex items-center gap-1 mb-0.5">
                <Icon className={`w-3 h-3 ${m.color}`} />
                <span className="text-[9px] text-ink-400 truncate">{m.label}</span>
              </div>
              <div className={`text-base font-mono font-medium ${m.color}`}>{m.value}</div>
              <div className="text-[9px] text-ink-500 truncate">{m.sub}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
