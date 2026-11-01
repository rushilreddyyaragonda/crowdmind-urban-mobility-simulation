import type { SimulationRun, NotebookEntry, Scenario, SimulationConfig, SerializedNetwork, Disruption } from '../engine/types';
import { APP_VERSION } from '../engine/city';

const DB_NAME = 'crowdmind-db';
const DB_VERSION = 1;
const STORE_RUNS = 'runs';
const STORE_NOTES = 'notes';
const STORE_SCENARIOS = 'scenarios';
const STORE_PREFS = 'prefs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RUNS)) {
        db.createObjectStore(STORE_RUNS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SCENARIOS)) {
        db.createObjectStore(STORE_SCENARIOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PREFS)) {
        db.createObjectStore(STORE_PREFS);
      }
    };
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

// === Runs ===
export async function saveRun(run: SimulationRun): Promise<void> {
  await tx(STORE_RUNS, 'readwrite', s => s.put(run));
}

export async function getRun(id: string): Promise<SimulationRun | null> {
  const result = await tx<SimulationRun | undefined>(STORE_RUNS, 'readonly', s => s.get(id));
  return result ?? null;
}

export async function getAllRuns(): Promise<SimulationRun[]> {
  return await tx<SimulationRun[]>(STORE_RUNS, 'readonly', s => s.getAll());
}

export async function deleteRun(id: string): Promise<void> {
  await tx(STORE_RUNS, 'readwrite', s => s.delete(id));
}

// === Notes ===
export async function saveNote(note: NotebookEntry): Promise<void> {
  await tx(STORE_NOTES, 'readwrite', s => s.put(note));
}

export async function getAllNotes(): Promise<NotebookEntry[]> {
  return await tx<NotebookEntry[]>(STORE_NOTES, 'readonly', s => s.getAll());
}

export async function deleteNote(id: string): Promise<void> {
  await tx(STORE_NOTES, 'readwrite', s => s.delete(id));
}

// === Custom Scenarios ===
export async function saveCustomScenario(scenario: Scenario): Promise<void> {
  await tx(STORE_SCENARIOS, 'readwrite', s => s.put(scenario));
}

export async function getAllCustomScenarios(): Promise<Scenario[]> {
  return await tx<Scenario[]>(STORE_SCENARIOS, 'readonly', s => s.getAll());
}

export async function deleteCustomScenario(id: string): Promise<void> {
  await tx(STORE_SCENARIOS, 'readwrite', s => s.delete(id));
}

// === Preferences (localStorage for lightweight settings) ===
export function getPref<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(`crowdmind-pref-${key}`);
    if (val === null) return fallback;
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

export function setPref<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`crowdmind-pref-${key}`, JSON.stringify(value));
  } catch {
    // storage full or unavailable
  }
}

// === Export helpers ===
export function exportRunJSON(run: SimulationRun): string {
  return JSON.stringify(run, null, 2);
}

export function exportRunsCSV(runs: SimulationRun[]): string {
  const headers = [
    'Run ID', 'Scenario', 'Seed', 'Routing Strategy', 'Agent Count',
    'Completed', 'Stranded', 'Avg Travel Time', 'Median Travel Time',
    'Completion Rate', 'Total Wait Time', 'Congestion Exposure', 'Throughput',
    'Network Utilization', 'Status',
  ];
  const rows = runs.map(r => {
    const last = r.snapshots.length > 0 ? r.snapshots[r.snapshots.length - 1] : null;
    return [
      r.id, r.scenarioId, r.seed, r.config.routingStrategy, r.config.agentCount,
      last?.completedAgents ?? 0, last?.strandedAgents ?? 0,
      last?.avgTravelTime?.toFixed(2) ?? '0', last?.medianTravelTime?.toFixed(2) ?? '0',
      last?.completionRate?.toFixed(4) ?? '0', last?.totalWaitTime?.toFixed(2) ?? '0',
      last?.congestionExposure?.toFixed(2) ?? '0', last?.throughput?.toFixed(4) ?? '0',
      last?.networkUtilization?.toFixed(4) ?? '0', r.status,
    ];
  });
  return [headers, ...rows].map(r => r.join(',')).join('\n');
}

export function exportRunMarkdown(run: SimulationRun): string {
  const last = run.snapshots.length > 0 ? run.snapshots[run.snapshots.length - 1] : null;
  let md = `# CrowdMind Simulation Report\n\n`;
  md += `**Run ID:** ${run.id}\n`;
  md += `**Scenario:** ${run.scenarioId}\n`;
  md += `**Date:** ${new Date(run.startTime).toISOString()}\n`;
  md += `**Seed:** ${run.seed}\n`;
  md += `**Routing Strategy:** ${run.config.routingStrategy}\n`;
  md += `**Agent Count:** ${run.config.agentCount}\n`;
  md += `**Status:** ${run.status}\n\n`;
  md += `## Configuration\n\n`;
  md += `- Profile Distribution: ${JSON.stringify(run.config.profileDistribution)}\n`;
  md += `- Simulation Speed: ${run.config.simulationSpeed}\n`;
  md += `- Congestion Weight: ${run.config.congestionWeight}\n`;
  md += `- Spawn Rate: ${run.config.spawnRate}\n\n`;
  md += `## Results\n\n`;
  if (last) {
    md += `| Metric | Value |\n|--------|-------|\n`;
    md += `| Completed Agents | ${last.completedAgents} |\n`;
    md += `| Stranded Agents | ${last.strandedAgents} |\n`;
    md += `| Avg Travel Time | ${last.avgTravelTime.toFixed(2)} |\n`;
    md += `| Median Travel Time | ${last.medianTravelTime.toFixed(2)} |\n`;
    md += `| Completion Rate | ${(last.completionRate * 100).toFixed(1)}% |\n`;
    md += `| Total Wait Time | ${last.totalWaitTime.toFixed(2)} |\n`;
    md += `| Congestion Exposure | ${last.congestionExposure.toFixed(2)} |\n`;
    md += `| Throughput | ${last.throughput.toFixed(4)} |\n`;
    md += `| Network Utilization | ${(last.networkUtilization * 100).toFixed(1)}% |\n\n`;
  } else {
    md += `No snapshot data available.\n\n`;
  }
  md += `## Disruptions\n\n`;
  if (run.disruptions.length === 0) {
    md += `None.\n\n`;
  } else {
    for (const d of run.disruptions) {
      md += `- **${d.label}** (type: ${d.type}, start: ${d.startTime}, duration: ${d.duration}, intensity: ${d.intensity})\n`;
    }
    md += `\n`;
  }
  md += `## Events Log\n\n`;
  const recentEvents = run.events.slice(-20);
  for (const e of recentEvents) {
    md += `- [t=${e.simTime.toFixed(1)}] ${e.type}: ${e.description}\n`;
  }
  md += `\n---\n*Generated by CrowdMind v${APP_VERSION}*\n`;
  return md;
}

export function exportNotebookMarkdown(note: NotebookEntry): string {
  let md = `# ${note.title}\n\n`;
  md += `**Created:** ${new Date(note.createdAt).toISOString()}\n\n`;
  md += `## Research Question\n${note.researchQuestion}\n\n`;
  md += `## Hypothesis\n${note.hypothesis}\n\n`;
  md += `## Scenario\n${note.scenario}\n\n`;
  md += `## Configuration\n${note.config}\n\n`;
  md += `## Run IDs\n${note.runIds.join(', ')}\n\n`;
  md += `## Observations\n${note.observations}\n\n`;
  md += `## Results\n${note.results}\n\n`;
  md += `## Interpretation\n${note.interpretation}\n\n`;
  md += `## Limitations\n${note.limitations}\n\n`;
  md += `## Next Steps\n${note.nextSteps}\n\n`;
  return md;
}

export function downloadFile(filename: string, content: string, mime: string = 'text/plain'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateRunId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `run-${ts}-${rand}`;
}

export function generateNoteId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `note-${ts}-${rand}`;
}

// Scenario import/export
export function exportScenarioJSON(scenario: Scenario): string {
  return JSON.stringify(scenario, null, 2);
}

export function validateImportedScenario(data: unknown): { valid: boolean; scenario?: Scenario; error?: string } {
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Invalid format: expected an object.' };
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.name !== 'string' || typeof obj.objective !== 'string') {
    return { valid: false, error: 'Missing required fields: id, name, or objective.' };
  }
  if (!Array.isArray((obj.network as { nodes?: unknown[] })?.nodes) || !Array.isArray((obj.network as { edges?: unknown[] })?.edges)) {
    return { valid: false, error: 'Network must have nodes and edges arrays.' };
  }
  if (!obj.config || typeof obj.config !== 'object') {
    return { valid: false, error: 'Missing simulation config.' };
  }
  return { valid: true, scenario: obj as unknown as Scenario };
}
