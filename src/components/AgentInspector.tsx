import type { SimulationHandle } from '../hooks/useSimulation';
import { PROFILE_LABELS } from '../engine/city';
import { Users, MapPin, Route, Clock, Activity } from 'lucide-react';

interface Props {
  agentId: number;
  sim: SimulationHandle;
}

export default function AgentInspector({ agentId, sim }: Props) {
  const agent = sim.getAgent(agentId);
  if (!agent) {
    return (
      <div className="bg-ink-800/50 rounded-lg border border-ink-700 p-3">
        <p className="text-xs text-ink-400">
          This agent has completed its journey or is no longer active.
          Check the Results Observatory for archived agent histories.
        </p>
      </div>
    );
  }

  if (!sim.state) return null;
  const originNode = sim.state.graph.nodes.get(agent.originNodeId);
  const destNode = sim.state.graph.nodes.get(agent.destinationNodeId);
  const currentNode = agent.route[agent.routeIndex]
    ? sim.state.graph.nodes.get(agent.route[agent.routeIndex])
    : null;

  return (
    <div className="bg-ink-800/50 rounded-lg border border-ink-700 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-ink-400 font-mono">AGENT INSPECTOR</div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: agent.color }} />
          <span className="text-[10px] font-mono text-ink-300">#{agent.id}</span>
        </div>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex items-center gap-2">
          <MapPin className="w-3 h-3 text-cyan-400 flex-shrink-0" />
          <span className="text-ink-400">From:</span>
          <span className="text-ink-200">{originNode?.label || agent.originNodeId}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span className="text-ink-400">To:</span>
          <span className="text-ink-200">{destNode?.label || agent.destinationNodeId}</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="w-3 h-3 text-accent-300 flex-shrink-0" />
          <span className="text-ink-400">Profile:</span>
          <span className="text-ink-200">{PROFILE_LABELS[agent.profile]}</span>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="w-3 h-3 text-ink-400 flex-shrink-0" />
          <span className="text-ink-400">State:</span>
          <span className={
            agent.state === 'arrived' ? 'text-accent-300' :
            agent.state === 'stranded' ? 'text-crimson-400' :
            agent.state === 'queued' ? 'text-amber-400' :
            'text-cyan-400'
          }>
            {agent.state}
          </span>
        </div>
      </div>

      <div className="h-px bg-ink-700" />

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-[9px] text-ink-500">Speed</div>
          <div className="font-mono text-ink-200">{agent.currentSpeed.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[9px] text-ink-500">Distance</div>
          <div className="font-mono text-ink-200">{agent.distanceTraveled.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-[9px] text-ink-500">Wait Time</div>
          <div className="font-mono text-amber-400">{agent.waitTime.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-[9px] text-ink-500">Congestion Exp.</div>
          <div className="font-mono text-amber-400">{agent.congestionExposure.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-[9px] text-ink-500">Reroutes</div>
          <div className="font-mono text-ink-200">{agent.rerouteCount}</div>
        </div>
        <div>
          <div className="text-[9px] text-ink-500">Spawned at</div>
          <div className="font-mono text-ink-200">{agent.spawnedAt.toFixed(1)}</div>
        </div>
      </div>

      <div className="h-px bg-ink-700" />

      <div>
        <div className="text-[9px] text-ink-500 mb-1">Current Route ({agent.route.length} nodes)</div>
        <div className="flex flex-wrap gap-1 text-[10px] font-mono">
          {agent.route.map((nodeId, i) => {
            const node = sim.state?.graph.nodes.get(nodeId);
            const isPast = i < agent.routeIndex;
            const isCurrent = i === agent.routeIndex;
            return (
              <span
                key={i}
                className={`px-1.5 py-0.5 rounded ${
                  isCurrent ? 'bg-accent-400/20 text-accent-300' :
                  isPast ? 'bg-ink-700 text-ink-500' :
                  'bg-ink-700 text-ink-300'
                }`}
              >
                {node?.label || nodeId}
              </span>
            );
          })}
        </div>
      </div>

      {currentNode && (
        <div className="text-[10px] text-ink-400">
          Currently at: <span className="text-ink-200">{currentNode.label || currentNode.id}</span>
        </div>
      )}

      <div className="text-[9px] text-ink-500 italic">
        {agent.accessible
          ? 'Requires accessible paths only.'
          : 'No accessibility constraints.'}
      </div>
    </div>
  );
}
