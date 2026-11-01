import { useRef, useState, useEffect, useCallback } from 'react';
import type { SimulationState } from '../engine/simulation';
import type { SimulationConfig, SerializedNetwork, Disruption, SimulationSnapshot, SimulationEvent, AgentHistoryRecord, Agent } from '../engine/types';
import {
  createSimulation,
  stepSimulation,
  initializeSpawnQueue,
  resetSimulation,
  takeSnapshot,
} from '../engine/simulation';
import { SeededRandom } from '../engine/rng';

export interface SimulationHandle {
  state: SimulationState | null;
  running: boolean;
  step: number;
  simTime: number;
  activeAgents: number;
  snapshots: SimulationSnapshot[];
  events: SimulationEvent[];
  agentHistories: AgentHistoryRecord[];
  config: SimulationConfig | null;
  currentNetwork: SerializedNetwork | null;
  currentDisruptions: Disruption[];
  currentScenarioId: string | null;
  init: (network: SerializedNetwork, config: SimulationConfig, disruptions: Disruption[], scenarioId: string) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  stepForward: () => void;
  setSpeed: (speed: number) => void;
  updateConfig: (partial: Partial<SimulationConfig>) => void;
  updateNetwork: (network: SerializedNetwork) => void;
  addDisruption: (disruption: Disruption) => void;
  removeDisruption: (id: string) => void;
  getAgent: (id: number) => Agent | undefined;
  getSnapshot: () => SimulationSnapshot | null;
}

export function useSimulation(): SimulationHandle {
  const stateRef = useRef<SimulationState | null>(null);
  const [, forceUpdate] = useState(0);
  const [running, setRunning] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const speedRef = useRef<number>(1);
  const scenarioIdRef = useRef<string | null>(null);
  const initNetworkRef = useRef<SerializedNetwork | null>(null);
  const initDisruptionsRef = useRef<Disruption[]>([]);
  const initConfigRef = useRef<SimulationConfig | null>(null);

  const rerender = useCallback(() => forceUpdate(n => n + 1), []);

  const init = useCallback((network: SerializedNetwork, config: SimulationConfig, disruptions: Disruption[], scenarioId: string) => {
    const state = createSimulation(network, config, disruptions);
    stateRef.current = state;
    scenarioIdRef.current = scenarioId;
    initNetworkRef.current = JSON.parse(JSON.stringify(network));
    initDisruptionsRef.current = JSON.parse(JSON.stringify(disruptions));
    initConfigRef.current = JSON.parse(JSON.stringify(config));
    speedRef.current = config.simulationSpeed;

    const entrances = Array.from(state.graph.nodes.values()).filter(n => n.type === 'entrance');
    const destinations = Array.from(state.graph.nodes.values()).filter(n => n.type === 'destination');
    initializeSpawnQueue(state, entrances, destinations);
    setRunning(false);
    rerender();
  }, [rerender]);

  const tick = useCallback((timestamp: number) => {
    const state = stateRef.current;
    if (!state || !state.running) return;

    const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05) * speedRef.current;
    lastTimeRef.current = timestamp;

    if (dt > 0) {
      // Run multiple sub-steps for smoother simulation
      const subSteps = Math.max(1, Math.ceil(speedRef.current));
      const subDt = dt / subSteps;
      for (let i = 0; i < subSteps; i++) {
        stepSimulation(state, subDt);
      }
    }

    rerender();
    rafRef.current = requestAnimationFrame(tick);
  }, [rerender]);

  const start = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;
    state.running = true;
    setRunning(true);
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;
    state.running = false;
    setRunning(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    rerender();
  }, [rerender]);

  const resume = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;
    if (state.running) return;
    state.running = true;
    setRunning(true);
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const reset = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;
    pause();
    if (initNetworkRef.current && initConfigRef.current) {
      const freshState = createSimulation(initNetworkRef.current, initConfigRef.current, initDisruptionsRef.current);
      stateRef.current = freshState;
      const entrances = Array.from(freshState.graph.nodes.values()).filter(n => n.type === 'entrance');
      const destinations = Array.from(freshState.graph.nodes.values()).filter(n => n.type === 'destination');
      initializeSpawnQueue(freshState, entrances, destinations);
    }
    setRunning(false);
    rerender();
  }, [pause, rerender]);

  const stepForward = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;
    const wasRunning = state.running;
    if (wasRunning) pause();
    stepSimulation(state, 0.5);
    rerender();
  }, [pause, rerender]);

  const setSpeed = useCallback((speed: number) => {
    speedRef.current = speed;
    const state = stateRef.current;
    if (state) {
      state.config.simulationSpeed = speed;
    }
  }, []);

  const updateConfig = useCallback((partial: Partial<SimulationConfig>) => {
    const state = stateRef.current;
    if (!state) return;
    state.config = { ...state.config, ...partial };
    if (partial.simulationSpeed !== undefined) {
      speedRef.current = partial.simulationSpeed;
    }
    rerender();
  }, [rerender]);

  const updateNetwork = useCallback((network: SerializedNetwork) => {
    const state = stateRef.current;
    if (!state) return;
    initNetworkRef.current = JSON.parse(JSON.stringify(network));
    // Rebuild graph but preserve simulation state
    // For simplicity, require reset after network changes
    rerender();
  }, [rerender]);

  const addDisruption = useCallback((disruption: Disruption) => {
    const state = stateRef.current;
    if (!state) return;
    state.disruptions.push({ ...disruption, active: false, applied: false });
    initDisruptionsRef.current = [...state.disruptions.map(d => ({ ...d, active: false, applied: false }))];
    rerender();
  }, [rerender]);

  const removeDisruption = useCallback((id: string) => {
    const state = stateRef.current;
    if (!state) return;
    state.disruptions = state.disruptions.filter(d => d.id !== id);
    initDisruptionsRef.current = [...state.disruptions.map(d => ({ ...d, active: false, applied: false }))];
    rerender();
  }, [rerender]);

  const getAgent = useCallback((id: number): Agent | undefined => {
    const state = stateRef.current;
    if (!state) return undefined;
    return state.agents.get(id);
  }, []);

  const getSnapshot = useCallback((): SimulationSnapshot | null => {
    const state = stateRef.current;
    if (!state) return null;
    return takeSnapshot(state);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const state = stateRef.current;
  return {
    state,
    running,
    step: state?.step ?? 0,
    simTime: state?.simTime ?? 0,
    activeAgents: state?.agents.size ?? 0,
    snapshots: state?.snapshots ?? [],
    events: state?.events ?? [],
    agentHistories: state?.agentHistories ?? [],
    config: state?.config ?? initConfigRef.current,
    currentNetwork: initNetworkRef.current,
    currentDisruptions: state?.disruptions ?? [],
    currentScenarioId: scenarioIdRef.current,
    init,
    start,
    pause,
    resume,
    reset,
    stepForward,
    setSpeed,
    updateConfig,
    updateNetwork,
    addDisruption,
    removeDisruption,
    getAgent,
    getSnapshot,
  };
}
