import { useState, useEffect, useRef } from 'react';
import {
  Library, Play, Upload, Download, FileJson, Info, Target,
  Clock, Users, Zap, Building2, AlertTriangle,
} from 'lucide-react';
import type { Scenario } from '../engine/types';
import { exportScenarioJSON, downloadFile, validateImportedScenario, saveCustomScenario, getAllCustomScenarios, deleteCustomScenario } from '../utils/storage';

interface Props {
  scenarios: Scenario[];
  currentScenarioId: string | undefined;
  onLoadScenario: (s: Scenario) => void;
}

const SCENARIO_ICONS = [Clock, AlertTriangle, Zap, Users, Building2, AlertTriangle];

export default function ScenarioLibrary({ scenarios, currentScenarioId, onLoadScenario }: Props) {
  const [customScenarios, setCustomScenarios] = useState<Scenario[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCustom = async () => {
    const custom = await getAllCustomScenarios();
    setCustomScenarios(custom);
  };

  useEffect(() => { loadCustom(); }, []);

  const handleExport = (scenario: Scenario) => {
    downloadFile(`crowdmind-scenario-${scenario.id}.json`, exportScenarioJSON(scenario), 'application/json');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const result = validateImportedScenario(data);
        if (result.valid && result.scenario) {
          const imported = { ...result.scenario, id: `custom-${Date.now()}` };
          await saveCustomScenario(imported);
          setCustomScenarios(prev => [...prev, imported]);
          alert(`Scenario "${imported.name}" imported successfully.`);
        } else {
          alert(`Import failed: ${result.error}`);
        }
      } catch {
        alert('Import failed: invalid JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteCustom = async (id: string) => {
    if (!confirm('Delete this custom scenario?')) return;
    await deleteCustomScenario(id);
    setCustomScenarios(prev => prev.filter(s => s.id !== id));
  };

  const allScenarios = [...scenarios, ...customScenarios];

  return (
    <div className="h-full overflow-y-auto bg-ink-950">
      <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Library className="w-5 h-5 text-accent-300" />
            <h1 className="text-xl font-semibold">Scenario Library</h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-ink-800 border border-ink-700 text-ink-300 rounded-lg text-xs hover:bg-ink-700 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Import Scenario
            </button>
          </div>
        </div>
        <p className="text-sm text-ink-400">
          Each scenario has a unique network configuration, initial conditions, and research objective. Importing a scenario file never executes code — only data is loaded.
        </p>

        <div className="grid md:grid-cols-2 gap-3">
          {allScenarios.map((scenario, i) => {
            const Icon = SCENARIO_ICONS[i % SCENARIO_ICONS.length] || Target;
            const isActive = scenario.id === currentScenarioId;
            const isCustom = scenario.id.startsWith('custom-');
            return (
              <div
                key={scenario.id}
                className={`bg-ink-900 border rounded-xl p-4 transition-colors ${
                  isActive ? 'border-accent-400/50 bg-accent-400/5' : 'border-ink-700 hover:border-ink-600'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isActive ? 'bg-accent-400/20' : 'bg-ink-800'}`}>
                      <Icon className={`w-4 h-4 ${isActive ? 'text-accent-300' : 'text-ink-400'}`} />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{scenario.name}</div>
                      {isCustom && <span className="text-[10px] text-amber-400">custom</span>}
                    </div>
                  </div>
                  {isActive && <span className="text-[10px] text-accent-300 bg-accent-400/10 px-2 py-0.5 rounded">LOADED</span>}
                </div>

                <p className="text-xs text-ink-400 mb-2">{scenario.description}</p>

                <div className="bg-ink-800/50 rounded-md p-2 mb-2">
                  <div className="text-[10px] text-ink-400 font-mono mb-0.5">OBJECTIVE</div>
                  <div className="text-xs text-ink-200">{scenario.objective}</div>
                </div>

                <div className="space-y-1 mb-3">
                  <div className="text-[10px] text-ink-400 font-mono">SUGGESTED RESEARCH QUESTIONS</div>
                  {scenario.suggestedQuestions.map((q, i) => (
                    <div key={i} className="text-[11px] text-ink-300 flex items-start gap-1">
                      <span className="text-accent-300 mt-0.5">•</span>
                      <span>{q}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-[10px] text-ink-500 font-mono">
                    {scenario.network.nodes.length} nodes · {scenario.network.edges.length} edges · {scenario.config.agentCount} agents
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleExport(scenario)}
                      className="p-1.5 text-ink-400 hover:text-accent-300 transition-colors"
                      title="Export scenario"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    {isCustom && (
                      <button
                        onClick={() => handleDeleteCustom(scenario.id)}
                        className="p-1.5 text-ink-400 hover:text-crimson-400 transition-colors"
                        title="Delete"
                      >
                        <FileJson className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => onLoadScenario(scenario)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-400/20 border border-accent-400/50 text-accent-300 rounded-lg text-xs hover:bg-accent-400/30 transition-colors"
                    >
                      <Play className="w-3 h-3" /> Load
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-ink-900 border border-ink-700 rounded-xl p-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-ink-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-ink-400">
            Scenarios are designed to be distinct — each has its own network geometry, agent distribution, and disruption setup. They are not the same map with a different title.
            Design your own cities in the City Designer and export them as scenario files to share with others.
          </p>
        </div>
      </div>
    </div>
  );
}
