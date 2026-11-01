import {
  Code2, Mail, GraduationCap, BookOpen, Cpu, GitBranch,
  AlertTriangle, Lightbulb, FileText, ExternalLink,
} from 'lucide-react';
import { APP_VERSION } from '../engine/city';

export default function Developer() {
  return (
    <div className="h-full overflow-y-auto bg-ink-950">
      <div className="max-w-3xl mx-auto p-4 lg:p-8 space-y-6">
        {/* Header */}
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-2xl bg-accent-400/20 flex items-center justify-center mx-auto mb-3">
            <Code2 className="w-8 h-8 text-accent-300" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Behind CrowdMind</h1>
          <p className="text-sm text-ink-400 mt-1 italic">A city is not a map. It is millions of decisions happening at once.</p>
        </div>

        {/* Developer info */}
        <div className="bg-ink-900 border border-ink-700 rounded-xl p-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <InfoRow icon={Code2} label="Developer" value="Rushil Reddy Yaragonda" />
            <InfoRow icon={GraduationCap} label="School" value="UIA International School of Tokyo, Tokyo" />
            <InfoRow icon={BookOpen} label="Academic Field" value="Computer Science" />
            <InfoRow icon={Mail} label="Contact" value="rushil2626reddy@gmail.com" link="mailto:rushil2626reddy@gmail.com" />
          </div>
        </div>

        {/* Project intro */}
        <div className="bg-ink-900 border border-ink-700 rounded-xl p-5">
          <h2 className="text-sm font-mono text-accent-300 mb-2">PROJECT INTRODUCTION</h2>
          <p className="text-sm text-ink-200 leading-relaxed">
            CrowdMind explores how individual movement decisions interact with infrastructure constraints to create city-wide patterns.
            Through agent-based simulation, graph algorithms, and controlled experiments, the project investigates how disruptions
            and design choices affect mobility, accessibility, and network resilience.
          </p>
        </div>

        {/* Motivation */}
        <Section icon={Lightbulb} title="Motivation">
          <p className="text-sm text-ink-300 leading-relaxed">
            Cities appear orderly when viewed from above. Roads, stations, crossings, and buildings form a physical network.
            At ground level, however, every pedestrian makes individual decisions based on destination, distance, obstacles,
            congestion, perceived safety, and available routes. When thousands of these decisions interact, unexpected patterns emerge.
          </p>
          <p className="text-sm text-ink-300 leading-relaxed mt-2">
            CrowdMind was built to make these dynamics visible and investigable — not through random animations, but through a real
            computational model where every outcome emerges from defined rules and measurable interactions.
          </p>
        </Section>

        {/* Research questions */}
        <Section icon={BookOpen} title="Research Questions">
          <ul className="space-y-1.5 text-sm text-ink-300">
            {[
              'Why does congestion emerge even when every pedestrian follows a reasonable route?',
              'Which infrastructure changes reduce total travel time most effectively?',
              'How does closing a single passage affect the wider city?',
              'Does adding an exit always improve crowd movement?',
              'Can a shorter route produce worse overall outcomes?',
              'Which locations are most important to the movement network?',
              'How do different pedestrian behaviors affect congestion?',
              'Do infrastructure improvements benefit all regions equally?',
              'How does a city recover when a critical route becomes unavailable?',
            ].map((q, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-accent-300 mt-0.5">•</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Methodology */}
        <Section icon={Cpu} title="Simulation Methodology">
          <div className="space-y-3 text-sm text-ink-300">
            <div>
              <strong className="text-ink-200">City Graph:</strong> The city is represented as a directed graph with nodes
              (intersections, entrances, exits, destinations, stations) and edges (walkways, corridors, streets, passages).
              Each edge has length, capacity, accessibility level, and availability state.
            </div>
            <div>
              <strong className="text-ink-200">Agent Routing:</strong> Agents use Dijkstra's algorithm to find shortest paths.
              Three routing strategies are implemented: shortest-distance, congestion-aware (using current edge occupancy),
              and balanced (weighting distance and congestion). Accessibility-conscious agents avoid stairs-only edges.
            </div>
            <div>
              <strong className="text-ink-200">Movement:</strong> Agents traverse edges at a speed modulated by congestion.
              Speed decreases nonlinearly as occupancy approaches capacity using a bounded function:
              <code className="block bg-ink-800 rounded-md p-2 mt-1 font-mono text-xs text-ink-200">
                speed = desiredSpeed × (1 − (1 − minFactor) × (occupancy/capacity)²)
              </code>
            </div>
            <div>
              <strong className="text-ink-200">Congestion:</strong> Edge traversal cost increases with occupancy:
              <code className="block bg-ink-800 rounded-md p-2 mt-1 font-mono text-xs text-ink-200">
                cost = length × (1 + weight × (occupancy/capacity)²)
              </code>
              This is bounded because occupancy cannot exceed capacity. Agents queue when an edge is at full capacity.
            </div>
            <div>
              <strong className="text-ink-200">Disruptions:</strong> Six disruption types modify the network at specified times:
              station closures, blocked passages, demand surges, reduced capacity, event dispersal, and temporary restrictions.
              Outcomes emerge from the simulation — no results are hardcoded.
            </div>
            <div>
              <strong className="text-ink-200">Reproducibility:</strong> A seeded random number generator ensures that
              the same configuration produces the same agent spawn order, profile assignment, and routing decisions.
            </div>
          </div>
        </Section>

        {/* Technical architecture */}
        <Section icon={GitBranch} title="Technical Architecture">
          <div className="space-y-2 text-sm text-ink-300">
            <div><strong className="text-ink-200">Frontend:</strong> React + TypeScript, styled with Tailwind CSS</div>
            <div><strong className="text-ink-200">Rendering:</strong> HTML5 Canvas for the simulation view, SVG/CSS for UI</div>
            <div><strong className="text-ink-200">Simulation Engine:</strong> Custom agent-based model with graph algorithms (Dijkstra, articulation points, bridge edges)</div>
            <div><strong className="text-ink-200">Persistence:</strong> IndexedDB for saved runs, scenarios, and research notes; localStorage for preferences</div>
            <div><strong className="text-ink-200">No backend required:</strong> All computation runs client-side. No paid APIs, authentication, or external services.</div>
            <div><strong className="text-ink-200">Build:</strong> Vite for bundling. Deployable on Vercel or Netlify.</div>
            <div><strong className="text-ink-200">Version:</strong> {APP_VERSION}</div>
          </div>
        </Section>

        {/* Algorithms */}
        <Section icon={Cpu} title="Algorithms Implemented">
          <ul className="space-y-1 text-sm text-ink-300">
            <li>• Dijkstra's shortest-path algorithm (with configurable edge cost functions)</li>
            <li>• Congestion-aware routing (occupancy-weighted edge costs)</li>
            <li>• Accessibility-constrained routing (stairs-only edge filtering)</li>
            <li>• Connected components analysis</li>
            <li>• Articulation point detection (DFS-based, Tarjan's algorithm)</li>
            <li>• Bridge edge detection</li>
            <li>• Network reachability testing after node/edge removal</li>
            <li>• Bounded congestion cost function (quadratic, capacity-limited)</li>
            <li>• Seeded random number generation (xorshift32)</li>
            <li>• Agent-based movement with queueing and rerouting</li>
          </ul>
        </Section>

        {/* Known limitations */}
        <Section icon={AlertTriangle} title="Known Limitations">
          <div className="space-y-2 text-sm text-ink-300">
            <p>
              The model is a simplified computational representation of pedestrian movement. It does not automatically reproduce:
            </p>
            <ul className="space-y-1 ml-4">
              <li>• Real human psychology or social dynamics</li>
              <li>• Actual emergency behavior or evacuation protocols</li>
              <li>• Building-specific fire safety or crowd management rules</li>
              <li>• Calibrated real-world crowd density measurements</li>
            </ul>
            <p className="mt-2">
              Results should not be presented as safety certification, professional evacuation advice, or validated predictions
              for a real city. The goal is to support investigation and hypothesis formation — not to replace professional
              urban engineering or public-safety analysis.
            </p>
            <p>
              Browser performance limits the maximum number of simultaneously active agents. The simulation uses efficient
              canvas rendering but is not optimized for thousands of agents on low-end devices.
            </p>
          </div>
        </Section>

        {/* Future research */}
        <Section icon={Lightbulb} title="Future Research Directions">
          <ul className="space-y-1.5 text-sm text-ink-300">
            <li>• Web Worker offloading for larger-scale simulations</li>
            <li>• Real-world dataset integration (with documented sources and licensing)</li>
            <li>• Multi-modal routing (combining walking with transit)</li>
            <li>• Time-varying demand profiles (full daily patterns)</li>
            <li>• Social force models for finer-grained crowd dynamics</li>
            <li>• Statistical analysis across multiple repeated runs</li>
          </ul>
        </Section>

        {/* Contact */}
        <div className="bg-ink-900 border border-ink-700 rounded-xl p-5 text-center">
          <h2 className="text-sm font-mono text-accent-300 mb-3">CONTACT</h2>
          <a
            href="mailto:rushil2626reddy@gmail.com"
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent-400/20 border border-accent-400/50 text-accent-300 rounded-lg text-sm hover:bg-accent-400/30 transition-colors"
          >
            <Mail className="w-4 h-4" />
            rushil2626reddy@gmail.com
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Footer */}
        <div className="text-center pb-4">
          <p className="text-[10px] text-ink-500">
            CrowdMind: The City Under Pressure · v{APP_VERSION} · Built by Rushil Reddy Yaragonda
          </p>
          <p className="text-[10px] text-ink-600 mt-1">
            An original student-built computational investigation. No awards, publications, or real-world deployments claimed.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Code2; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-ink-900 border border-ink-700 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-accent-300" />
        <h2 className="text-sm font-mono text-accent-300">{title.toUpperCase()}</h2>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, link }: { icon: typeof Code2; label: string; value: string; link?: string }) {
  const content = (
    <div className="flex items-start gap-2">
      <Icon className="w-4 h-4 text-ink-400 flex-shrink-0 mt-0.5" />
      <div>
        <div className="text-[10px] text-ink-500 font-mono">{label.toUpperCase()}</div>
        <div className="text-sm text-ink-200">{value}</div>
      </div>
    </div>
  );
  if (link) {
    return <a href={link} className="hover:text-accent-300 transition-colors">{content}</a>;
  }
  return content;
}
