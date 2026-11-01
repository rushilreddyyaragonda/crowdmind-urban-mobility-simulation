import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, Map, FlaskConical, Network, BarChart3, Library, NotebookPen,
  Code2, Menu, X, Play, Pause, RotateCcw, StepForward, ZoomIn, ZoomOut,
  Layers, Settings, ChevronRight, Eye, EyeOff, Maximize2,
} from 'lucide-react';
import { useSimulation } from './hooks/useSimulation';
import { buildScenarios, buildMainCity, DEFAULT_CONFIG, APP_VERSION } from './engine/city';
import type { Scenario, SimulationConfig, SerializedNetwork, Disruption } from './engine/types';
import { CityRenderer, DEFAULT_LAYERS, type LayerVisibility, type CameraState, type RenderOptions } from './render/renderer';
import { getPref, setPref } from './utils/storage';

import SimulationLab from './views/SimulationLab';
import CityDesigner from './views/CityDesigner';
import ExperimentStudio from './views/ExperimentStudio';
import NetworkIntelligence from './views/NetworkIntelligence';
import ResultsObservatory from './views/ResultsObservatory';
import ScenarioLibrary from './views/ScenarioLibrary';
import ResearchNotebook from './views/ResearchNotebook';
import Developer from './views/Developer';

export type ViewId =
  | 'simulation' | 'designer' | 'experiments' | 'network'
  | 'results' | 'scenarios' | 'notebook' | 'developer';

interface NavItem {
  id: ViewId;
  label: string;
  icon: typeof Activity;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'simulation', label: 'Simulation Lab', icon: Activity },
  { id: 'designer', label: 'City Designer', icon: Map },
  { id: 'experiments', label: 'Experiment Studio', icon: FlaskConical },
  { id: 'network', label: 'Network Intelligence', icon: Network },
  { id: 'results', label: 'Results Observatory', icon: BarChart3 },
  { id: 'scenarios', label: 'Scenario Library', icon: Library },
  { id: 'notebook', label: 'Research Notebook', icon: NotebookPen },
  { id: 'developer', label: 'Behind CrowdMind', icon: Code2 },
];

export default function App() {
  const [view, setView] = useState<ViewId>('simulation');
  const [navOpen, setNavOpen] = useState(false);
  const [scenarios] = useState<Scenario[]>(() => buildScenarios());
  const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null);
  const [customNetwork, setCustomNetwork] = useState<SerializedNetwork | null>(null);

  const sim = useSimulation();

  // Load last view from prefs
  useEffect(() => {
    const savedView = getPref<ViewId>('lastView', 'simulation');
    setView(savedView);
  }, []);

  // Save view to prefs
  const changeView = useCallback((v: ViewId) => {
    setView(v);
    setPref('lastView', v);
    setNavOpen(false);
  }, []);

  // Auto-load first scenario on mount
  useEffect(() => {
    if (!currentScenario && scenarios.length > 0) {
      loadScenario(scenarios[0]);
    }
  }, []);

  const loadScenario = useCallback((scenario: Scenario) => {
    setCurrentScenario(scenario);
    setCustomNetwork(null);
    const network = JSON.parse(JSON.stringify(scenario.network)) as SerializedNetwork;
    const config = { ...scenario.config };
    const disruptions = scenario.disruptions.map(d => ({ ...d, active: false, applied: false }));
    sim.init(network, config, disruptions, scenario.id);
  }, [sim]);

  const loadCustomNetwork = useCallback((network: SerializedNetwork, config?: SimulationConfig, disruptions?: Disruption[]) => {
    setCustomNetwork(network);
    const cfg = config || { ...DEFAULT_CONFIG };
    const dis = disruptions || [];
    sim.init(network, cfg, dis, 'custom');
  }, [sim]);

  const navItem = NAV_ITEMS.find(n => n.id === view);

  return (
    <div className="flex h-screen overflow-hidden bg-ink-950 text-ink-100">
      {/* Sidebar */}
      <aside className={`
        ${navOpen ? 'w-60' : 'w-0 lg:w-[72px]'}
        transition-all duration-300 flex-shrink-0
        bg-ink-900 lg:bg-gradient-to-b lg:from-ink-900 lg:to-ink-950
        border-r border-ink-700/80
        overflow-hidden flex flex-col
        z-40
      `}>
        <div className="p-3 flex items-center gap-3 border-b border-ink-700/80 w-full">
          <div className="w-9 h-9 rounded-xl bg-accent-400/15 border border-accent-400/30 flex items-center justify-center flex-shrink-0">
            <Activity className="w-5 h-5 text-accent-300" />
          </div>
          <div className={`min-w-0 ${navOpen ? 'block' : 'hidden lg:hidden'}`}>
            <div className="font-semibold text-sm tracking-tight text-ink-100">CrowdMind</div>
            <div className="text-[10px] text-ink-400 font-mono">v{APP_VERSION}</div>
          </div>
        </div>
        <nav className="flex-1 py-3 w-full space-y-0.5 px-2">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => changeView(item.id)}
                className={`
                  w-full flex items-center gap-3 ${navOpen ? 'px-3 justify-start' : 'lg:justify-center px-0'} py-2.5 rounded-lg text-sm
                  transition-all duration-150 group relative
                  ${active
                    ? 'bg-accent-400/15 text-accent-200 shadow-sm'
                    : 'text-ink-300 hover:text-ink-100 hover:bg-ink-800/80'
                  }
                `}
                title={navOpen ? undefined : item.label}
              >
                {active && !navOpen && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 rounded-r-full bg-accent-400" />
                )}
                <Icon className={`w-5 h-5 flex-shrink-0 transition-colors ${active ? 'text-accent-300' : 'text-ink-400 group-hover:text-ink-200'}`} />
                <span className={`${navOpen ? 'block' : 'hidden lg:hidden'} whitespace-nowrap font-medium`}>
                  {item.label}
                </span>
                {!navOpen && (
                  <span className="absolute left-full ml-2 px-2.5 py-1.5 bg-ink-800 text-ink-100 text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-xl border border-ink-700 hidden lg:block">
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-ink-700/80 w-full">
          <p className={`text-[10px] text-ink-500 leading-relaxed italic ${navOpen ? 'block' : 'hidden lg:hidden'}`}>
            A city is not a map.<br />It is millions of decisions happening at once.
          </p>
          <div className={`${navOpen ? 'hidden' : 'hidden lg:flex'} justify-center`}>
            <div className="w-1.5 h-1.5 rounded-full bg-ink-600" />
          </div>
        </div>
      </aside>

      {/* Mobile nav toggle */}
      <button
        onClick={() => setNavOpen(!navOpen)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-ink-800/95 backdrop-blur-sm border border-ink-600 shadow-lg"
        aria-label="Toggle navigation"
      >
        {navOpen ? <X className="w-5 h-5 text-ink-100" /> : <Menu className="w-5 h-5 text-ink-100" />}
      </button>

      {/* Main content */}
      <main className="flex-1 overflow-hidden relative">
        {view === 'simulation' && (
          <SimulationLab
            sim={sim}
            scenario={currentScenario}
            scenarios={scenarios}
            onLoadScenario={loadScenario}
          />
        )}
        {view === 'designer' && (
          <CityDesigner
            network={customNetwork || currentScenario?.network || buildMainCity()}
            onSave={(network) => loadCustomNetwork(network, sim.config || DEFAULT_CONFIG)}
            simRunning={sim.running}
          />
        )}
        {view === 'experiments' && (
          <ExperimentStudio sim={sim} scenarios={scenarios} currentScenario={currentScenario} />
        )}
        {view === 'network' && (
          <NetworkIntelligence
            network={sim.currentNetwork || currentScenario?.network || buildMainCity()}
          />
        )}
        {view === 'results' && (
          <ResultsObservatory sim={sim} scenario={currentScenario} />
        )}
        {view === 'scenarios' && (
          <ScenarioLibrary
            scenarios={scenarios}
            currentScenarioId={currentScenario?.id}
            onLoadScenario={loadScenario}
          />
        )}
        {view === 'notebook' && (
          <ResearchNotebook sim={sim} />
        )}
        {view === 'developer' && (
          <Developer />
        )}
      </main>
    </div>
  );
}
