import { useState } from 'react';
import {
  AlertTriangle, Plus, Trash2, Lock, Unlock, Zap, Users, Building2,
  MinusCircle, Clock,
} from 'lucide-react';
import type { SimulationHandle } from '../hooks/useSimulation';
import type { Disruption, DisruptionType } from '../engine/types';

interface Props {
  sim: SimulationHandle;
}

const DISRUPTION_TYPES: { type: DisruptionType; label: string; icon: typeof AlertTriangle; desc: string }[] = [
  { type: 'station-closure', label: 'Station Closure', icon: Lock, desc: 'Close a major station and observe demand redistribution' },
  { type: 'blocked-passage', label: 'Blocked Passage', icon: AlertTriangle, desc: 'Disable a walkway and investigate alternative route usage' },
  { type: 'demand-surge', label: 'Sudden Demand Surge', icon: Users, desc: 'Increase arrivals at a selected entrance' },
  { type: 'reduced-capacity', label: 'Reduced Capacity', icon: MinusCircle, desc: 'Reduce throughput of an edge without closing it' },
  { type: 'event-dispersal', label: 'Event Dispersal', icon: Zap, desc: 'Increase pedestrians leaving a destination simultaneously' },
  { type: 'temp-restriction', label: 'Temporary Restriction', icon: Clock, desc: 'Disable a route for a specified number of steps, then restore' },
];

export default function DisruptionPanel({ sim }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState<DisruptionType>('station-closure');
  const [targetId, setTargetId] = useState('');
  const [startTime, setStartTime] = useState(10);
  const [duration, setDuration] = useState(50);
  const [intensity, setIntensity] = useState(1.0);

  if (!sim.state) return null;

  const nodes = Array.from(sim.state.graph.nodes.values());
  const edges = Array.from(sim.state.graph.edges.values());

  // Filter targets based on disruption type
  const getValidTargets = () => {
    switch (selectedType) {
      case 'station-closure':
        return nodes.filter(n => n.type === 'station' || n.type === 'destination').map(n => ({ id: n.id, label: `${n.label} (${n.type})` }));
      case 'demand-surge':
        return nodes.filter(n => n.type === 'entrance').map(n => ({ id: n.id, label: n.label }));
      case 'event-dispersal':
        return nodes.filter(n => n.type === 'destination').map(n => ({ id: n.id, label: n.label }));
      case 'blocked-passage':
      case 'reduced-capacity':
      case 'temp-restriction':
        return edges.map(e => {
          const from = nodes.find(n => n.id === e.from);
          const to = nodes.find(n => n.id === e.to);
          return { id: e.id, label: `${from?.label || e.from} → ${to?.label || e.to}` };
        });
      default:
        return [];
    }
  };

  const targets = getValidTargets();

  const handleAdd = () => {
    if (!targetId) {
      const first = targets[0];
      if (first) setTargetId(first.id);
      return;
    }

    const typeInfo = DISRUPTION_TYPES.find(t => t.type === selectedType)!;
    const targetType = ['station-closure', 'demand-surge', 'event-dispersal'].includes(selectedType) ? 'node' : 'edge';

    const disruption: Disruption = {
      id: `d-${selectedType}-${targetId}-${Date.now()}`,
      type: selectedType,
      targetId,
      targetType,
      startTime,
      duration: selectedType === 'blocked-passage' || selectedType === 'station-closure' ? 0 : duration,
      intensity,
      active: false,
      applied: false,
      label: `${typeInfo.label}: ${targets.find(t => t.id === targetId)?.label || targetId}`,
    };

    sim.addDisruption(disruption);
    setShowForm(false);
    setTargetId('');
  };

  return (
    <div className="bg-ink-800/50 rounded-lg border border-ink-700 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-ink-400 font-mono">ACTIVE DISRUPTIONS</div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-[10px] flex items-center gap-1 text-accent-300 hover:text-accent-200 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {/* Existing disruptions */}
      <div className="space-y-1.5">
        {sim.currentDisruptions.length === 0 && !showForm && (
          <p className="text-xs text-ink-500 italic">No disruptions configured. Add one to see how the city responds.</p>
        )}
        {sim.currentDisruptions.map(d => (
          <div key={d.id} className="flex items-start justify-between bg-ink-900/50 rounded-md p-2 border border-ink-700/50">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-ink-200 truncate">{d.label}</div>
              <div className="text-[9px] text-ink-500 font-mono">
                t={d.startTime} | dur={d.duration} | int={d.intensity.toFixed(1)}
                {d.active && <span className="text-crimson-400 ml-1">● ACTIVE</span>}
                {d.applied && !d.active && <span className="text-ink-500 ml-1">● ended</span>}
              </div>
            </div>
            <button
              onClick={() => sim.removeDisruption(d.id)}
              className="text-ink-500 hover:text-crimson-400 transition-colors flex-shrink-0 ml-2"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-ink-900/80 rounded-md p-2.5 border border-ink-700 space-y-2 fade-in">
          <div className="text-[10px] text-ink-400 font-mono">DISRUPTION TYPE</div>
          <div className="grid grid-cols-2 gap-1">
            {DISRUPTION_TYPES.map(dt => {
              const Icon = dt.icon;
              return (
                <button
                  key={dt.type}
                  onClick={() => { setSelectedType(dt.type); setTargetId(''); }}
                  className={`text-[10px] px-2 py-1.5 rounded-md text-left transition-colors ${
                    selectedType === dt.type
                      ? 'bg-amber-400/20 text-amber-300 border border-amber-400/50'
                      : 'bg-ink-700 text-ink-300 border border-transparent hover:bg-ink-600'
                  }`}
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <Icon className="w-3 h-3" />
                    <span className="font-medium">{dt.label}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="text-[10px] text-ink-400 font-mono pt-1">TARGET</div>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full bg-ink-700 border border-ink-600 rounded-md px-2 py-1.5 text-xs text-ink-200"
          >
            <option value="">Select target...</option>
            {targets.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>
              <div className="text-[9px] text-ink-400 mb-0.5">Start Time</div>
              <input
                type="number"
                min="0"
                value={startTime}
                onChange={(e) => setStartTime(parseFloat(e.target.value) || 0)}
                className="w-full bg-ink-700 border border-ink-600 rounded-md px-1.5 py-1 text-xs font-mono text-ink-200"
              />
            </div>
            <div>
              <div className="text-[9px] text-ink-400 mb-0.5">Duration</div>
              <input
                type="number"
                min="0"
                value={duration}
                onChange={(e) => setDuration(parseFloat(e.target.value) || 0)}
                disabled={selectedType === 'station-closure' || selectedType === 'blocked-passage'}
                className="w-full bg-ink-700 border border-ink-600 rounded-md px-1.5 py-1 text-xs font-mono text-ink-200 disabled:opacity-40"
              />
            </div>
            <div>
              <div className="text-[9px] text-ink-400 mb-0.5">Intensity</div>
              <input
                type="number"
                min="0.1"
                max="5"
                step="0.1"
                value={intensity}
                onChange={(e) => setIntensity(parseFloat(e.target.value) || 1)}
                className="w-full bg-ink-700 border border-ink-600 rounded-md px-1.5 py-1 text-xs font-mono text-ink-200"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={!targetId && targets.length === 0}
              className="flex-1 text-xs bg-accent-400/20 text-accent-300 border border-accent-400/50 rounded-md py-1.5 hover:bg-accent-400/30 transition-colors disabled:opacity-40"
            >
              Activate Disruption
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-xs bg-ink-700 text-ink-300 border border-ink-600 rounded-md px-3 py-1.5 hover:bg-ink-600 transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="text-[9px] text-ink-500 italic">
            The disruption will activate at the specified simulation time. The actual outcome emerges from the simulation — no result is hardcoded.
          </p>
        </div>
      )}
    </div>
  );
}
