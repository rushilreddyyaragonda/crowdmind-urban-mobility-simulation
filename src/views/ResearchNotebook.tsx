import { useState, useEffect, useCallback } from 'react';
import {
  NotebookPen, Plus, Trash2, Search, Download, FileText, FileJson,
  Save, Calendar, Link2,
} from 'lucide-react';
import type { SimulationHandle } from '../hooks/useSimulation';
import type { NotebookEntry } from '../engine/types';
import { getAllNotes, saveNote, deleteNote, generateNoteId, exportNotebookMarkdown, downloadFile } from '../utils/storage';

interface Props {
  sim: SimulationHandle;
}

const EMPTY_ENTRY: NotebookEntry = {
  id: '',
  title: '',
  researchQuestion: '',
  hypothesis: '',
  scenario: '',
  config: '',
  runIds: [],
  observations: '',
  results: '',
  interpretation: '',
  limitations: '',
  nextSteps: '',
  createdAt: 0,
};

export default function ResearchNotebook({ sim }: Props) {
  const [entries, setEntries] = useState<NotebookEntry[]>([]);
  const [selected, setSelected] = useState<NotebookEntry | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const all = await getAllNotes();
    setEntries(all.sort((a, b) => b.createdAt - a.createdAt));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = entries.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.title.toLowerCase().includes(q) || e.researchQuestion.toLowerCase().includes(q) || e.hypothesis.toLowerCase().includes(q);
  }).sort((a, b) => sortBy === 'date' ? b.createdAt - a.createdAt : a.title.localeCompare(b.title));

  const handleNew = () => {
    const entry: NotebookEntry = {
      ...EMPTY_ENTRY,
      id: generateNoteId(),
      title: 'Untitled Experiment',
      createdAt: Date.now(),
      scenario: sim.currentScenarioId || '',
      config: sim.config ? JSON.stringify(sim.config, null, 2) : '',
    };
    setSelected(entry);
  };

  const handleSave = async () => {
    if (!selected) return;
    await saveNote(selected);
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this notebook entry? This cannot be undone.')) return;
    await deleteNote(id);
    if (selected?.id === id) setSelected(null);
    await load();
  };

  const handleExportMarkdown = (entry: NotebookEntry) => {
    downloadFile(`crowdmind-note-${entry.id}.md`, exportNotebookMarkdown(entry), 'text/markdown');
  };

  const handleExportJSON = (entry: NotebookEntry) => {
    downloadFile(`crowdmind-note-${entry.id}.json`, JSON.stringify(entry, null, 2), 'application/json');
  };

  const update = (field: keyof NotebookEntry, value: any) => {
    if (!selected) return;
    setSelected({ ...selected, [field]: value });
  };

  return (
    <div className="flex h-full bg-ink-950">
      {/* Entry list */}
      <div className="w-72 bg-ink-900 border-r border-ink-700 flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-ink-700">
          <div className="flex items-center gap-2 mb-2">
            <NotebookPen className="w-4 h-4 text-accent-300" />
            <span className="text-sm font-medium">Research Notebook</span>
          </div>
          <button
            onClick={handleNew}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-accent-400/20 border border-accent-400/50 text-accent-300 rounded-lg text-xs hover:bg-accent-400/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Entry
          </button>
          <div className="mt-2 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1.5 w-3.5 h-3.5 text-ink-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search entries..."
                className="w-full bg-ink-800 border border-ink-700 rounded-md pl-7 pr-2 py-1.5 text-xs text-ink-200"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'title')}
              className="w-full bg-ink-800 border border-ink-700 rounded-md px-2 py-1.5 text-xs text-ink-200"
            >
              <option value="date">Sort by date</option>
              <option value="title">Sort by title</option>
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 text-xs text-ink-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center">
              <NotebookPen className="w-6 h-6 text-ink-600 mx-auto mb-2" />
              <p className="text-xs text-ink-400">No entries yet. Click "New Entry" to start documenting.</p>
            </div>
          ) : (
            filtered.map(entry => (
              <button
                key={entry.id}
                onClick={() => setSelected(entry)}
                className={`w-full text-left p-3 border-b border-ink-800 hover:bg-ink-800/50 transition-colors ${
                  selected?.id === entry.id ? 'bg-accent-400/5' : ''
                }`}
              >
                <div className="text-sm font-medium text-ink-200 truncate">{entry.title}</div>
                <div className="text-[10px] text-ink-500 mt-0.5">{new Date(entry.createdAt).toLocaleDateString()}</div>
                {entry.researchQuestion && (
                  <div className="text-[10px] text-ink-400 mt-1 line-clamp-2">{entry.researchQuestion}</div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <input
                value={selected.title}
                onChange={(e) => update('title', e.target.value)}
                className="flex-1 bg-transparent border-none text-lg font-semibold text-ink-100 outline-none focus:ring-0"
                placeholder="Experiment title"
              />
              <div className="flex items-center gap-1">
                <button onClick={() => handleExportMarkdown(selected)} className="p-2 text-ink-400 hover:text-accent-300 transition-colors" title="Export Markdown">
                  <FileText className="w-4 h-4" />
                </button>
                <button onClick={() => handleExportJSON(selected)} className="p-2 text-ink-400 hover:text-accent-300 transition-colors" title="Export JSON">
                  <FileJson className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(selected.id)} className="p-2 text-ink-400 hover:text-crimson-400 transition-colors" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-400/20 border border-accent-400/50 text-accent-300 rounded-lg text-xs hover:bg-accent-400/30 transition-colors">
                  <Save className="w-3.5 h-3.5" /> Save
                </button>
              </div>
            </div>
            <div className="text-[10px] text-ink-500 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(selected.createdAt).toLocaleString()}
            </div>

            <Field label="Research Question" value={selected.researchQuestion} onChange={(v) => update('researchQuestion', v)} multiline placeholder="What question are you investigating?" />
            <Field label="Hypothesis" value={selected.hypothesis} onChange={(v) => update('hypothesis', v)} multiline placeholder="What do you expect to happen?" />
            <Field label="Scenario" value={selected.scenario} onChange={(v) => update('scenario', v)} placeholder="Which scenario?" />

            <div>
              <label className="text-xs text-ink-300 block mb-1">Configuration</label>
              <textarea
                value={selected.config}
                onChange={(e) => update('config', e.target.value)}
                className="w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 text-xs font-mono text-ink-300 resize-none"
                rows={4}
              />
            </div>

            <div>
              <label className="text-xs text-ink-300 block mb-1">Linked Run IDs</label>
              <div className="flex flex-wrap gap-1 mb-1">
                {selected.runIds.map(id => (
                  <span key={id} className="flex items-center gap-1 px-2 py-0.5 bg-ink-800 border border-ink-700 rounded text-[10px] font-mono text-ink-300">
                    <Link2 className="w-3 h-3" />
                    {id.slice(0, 16)}
                    <button onClick={() => update('runIds', selected.runIds.filter(r => r !== id))} className="text-ink-500 hover:text-crimson-400 ml-1">×</button>
                  </span>
                ))}
                {selected.runIds.length === 0 && <span className="text-[10px] text-ink-500">No runs linked.</span>}
              </div>
              <button
                onClick={() => {
                  const id = prompt('Enter run ID to link:');
                  if (id) update('runIds', [...selected.runIds, id]);
                }}
                className="text-[10px] text-accent-300 hover:text-accent-200"
              >
                + Link run
              </button>
            </div>

            <Field label="Observations" value={selected.observations} onChange={(v) => update('observations', v)} multiline placeholder="What did you observe during the simulation?" />
            <Field label="Results" value={selected.results} onChange={(v) => update('results', v)} multiline placeholder="What were the measured outcomes?" />
            <Field label="Interpretation" value={selected.interpretation} onChange={(v) => update('interpretation', v)} multiline placeholder="What do the results mean? Distinguish your interpretation from automatically generated metrics." />
            <Field label="Limitations" value={selected.limitations} onChange={(v) => update('limitations', v)} multiline placeholder="What are the limitations of this experiment?" />
            <Field label="Next Steps" value={selected.nextSteps} onChange={(v) => update('nextSteps', v)} multiline placeholder="What should be investigated next?" />

            <div className="bg-ink-900/50 border border-ink-700/50 rounded-lg p-2.5">
              <p className="text-[10px] text-ink-500 italic">
                Your interpretation is separate from automatically generated metrics. Do not claim the hypothesis is proven simply because one metric improved. Record unexpected outcomes and conflicting results honestly.
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <NotebookPen className="w-10 h-10 text-ink-600 mx-auto mb-3" />
              <p className="text-sm text-ink-400 mb-1">No entry selected</p>
              <p className="text-xs text-ink-500">Select an entry from the left, or create a new one.</p>
              <button
                onClick={handleNew}
                className="mt-3 flex items-center gap-1.5 px-3 py-2 bg-accent-400/20 border border-accent-400/50 text-accent-300 rounded-lg text-xs hover:bg-accent-400/30 transition-colors mx-auto"
              >
                <Plus className="w-3.5 h-3.5" /> New Entry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, multiline, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-ink-300 block mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 text-sm text-ink-200 resize-none"
          rows={3}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 text-sm text-ink-200"
        />
      )}
    </div>
  );
}
