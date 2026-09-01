import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  BrainCircuit,
  Search,
  Plus,
  Tag,
  CheckCircle2,
  Bot,
} from 'lucide-react';
import { storeMemory, searchMemory } from '../api/memory';
import type { MemorySearchResult } from '../api/memory';

export const Memory = () => {
  const [factInput, setFactInput] = useState('');
  const [factAgent, setFactAgent] = useState('default-agent');
  const [factTags, setFactTags] = useState('');
  const [storeStatus, setStoreStatus] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchAgent] = useState('');
  const [searchResults, setSearchResults] = useState<MemorySearchResult[]>([]);

  const storeMutation = useMutation({
    mutationFn: async () => {
      const tags = factTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      return storeMemory(factInput, factAgent || undefined, tags);
    },
    onSuccess: (res) => {
      setStoreStatus(`Successfully stored memory [${res.memory.id}]!`);
      setFactInput('');
      setFactTags('');
      setTimeout(() => setStoreStatus(null), 4000);
    },
  });

  const searchMutation = useMutation({
    mutationFn: async () => {
      return searchMemory(searchQuery, searchAgent || undefined, 5);
    },
    onSuccess: (res) => {
      setSearchResults(res.results || []);
    },
  });

  const handleStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!factInput.trim()) return;
    storeMutation.mutate();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    searchMutation.mutate();
  };

  return (
    <div className='flex-1 overflow-y-auto p-8 space-y-8 max-w-7xl mx-auto w-full'>
      <div>
        <h1 className='text-2xl font-bold text-white flex items-center gap-2.5'>
          <BrainCircuit size={24} className='text-cyan-400' />
          Long-Term Vector Memory Studio
        </h1>
        <p className='text-xs text-neutral-400 mt-1'>
          Store persistent facts, calculate dense cosine embeddings, and execute semantic vector recall across agent runs.
        </p>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-8'>
        {/* Left Column: Ingest New Memory Form */}
        <div className='p-6 rounded-2xl border border-neutral-800/80 bg-neutral-900/40 space-y-5'>
          <div className='flex items-center gap-2 border-b border-neutral-800 pb-3'>
            <Plus size={18} className='text-emerald-400' />
            <h2 className='text-sm font-bold text-white'>Ingest Memory Fact</h2>
          </div>

          <form onSubmit={handleStore} className='space-y-4 text-xs'>
            <div className='space-y-1.5'>
              <label className='text-neutral-300 font-medium'>Fact / Knowledge Content</label>
              <textarea
                value={factInput}
                onChange={(e) => setFactInput(e.target.value)}
                placeholder='e.g. The production PostgreSQL 16.2 database cluster is located in us-west-2...'
                rows={4}
                className='w-full bg-neutral-950 border border-neutral-800 focus:border-indigo-500 rounded-xl p-3 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none'
              />
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <label className='text-neutral-300 font-medium'>Assign to Agent</label>
                <input
                  type='text'
                  value={factAgent}
                  onChange={(e) => setFactAgent(e.target.value)}
                  placeholder='default-agent'
                  className='w-full bg-neutral-950 border border-neutral-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none'
                />
              </div>

              <div className='space-y-1.5'>
                <label className='text-neutral-300 font-medium'>Tags (Comma Separated)</label>
                <input
                  type='text'
                  value={factTags}
                  onChange={(e) => setFactTags(e.target.value)}
                  placeholder='database, infra, prod'
                  className='w-full bg-neutral-950 border border-neutral-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none'
                />
              </div>
            </div>

            <button
              type='submit'
              disabled={!factInput.trim() || storeMutation.isPending}
              className='w-full py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5'
            >
              <Plus size={14} />
              <span>{storeMutation.isPending ? 'Storing & Embedding...' : 'Store in Vector Memory'}</span>
            </button>

            {storeStatus && (
              <div className='p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 flex items-center gap-2 text-xs'>
                <CheckCircle2 size={14} />
                <span>{storeStatus}</span>
              </div>
            )}
          </form>
        </div>

        {/* Right Column: Semantic Search Playground */}
        <div className='p-6 rounded-2xl border border-neutral-800/80 bg-neutral-900/40 space-y-5'>
          <div className='flex items-center gap-2 border-b border-neutral-800 pb-3'>
            <Search size={18} className='text-cyan-400' />
            <h2 className='text-sm font-bold text-white'>Semantic Search Playground</h2>
          </div>

          <form onSubmit={handleSearch} className='space-y-3 text-xs'>
            <div className='flex gap-2'>
              <input
                type='text'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Search queries (e.g. "what db version in prod?")'
                className='flex-1 bg-neutral-950 border border-neutral-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none'
              />
              <button
                type='submit'
                disabled={!searchQuery.trim() || searchMutation.isPending}
                className='px-4 py-2.5 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white shadow-md shadow-cyan-600/20 transition-all flex items-center gap-1.5'
              >
                <Search size={14} />
                <span>{searchMutation.isPending ? 'Searching...' : 'Recall'}</span>
              </button>
            </div>

            <div className='flex gap-2 text-[11px] text-neutral-400'>
              <span>Try:</span>
              <button
                type='button'
                onClick={() => {
                  setSearchQuery('What database version is in production?');
                }}
                className='text-cyan-400 hover:underline'
              >
                "database version"
              </button>
              •
              <button
                type='button'
                onClick={() => {
                  setSearchQuery('ISO-27001 security standards for API keys');
                }}
                className='text-cyan-400 hover:underline'
              >
                "security standards"
              </button>
            </div>
          </form>

          {/* Search Results */}
          <div className='space-y-3 pt-2'>
            <div className='text-xs font-mono font-medium text-neutral-400 flex items-center justify-between'>
              <span>Matched Memories</span>
              <span>{searchResults.length} matches</span>
            </div>

            {searchResults.length === 0 ? (
              <div className='py-8 text-center text-xs text-neutral-400 border border-dashed border-neutral-800 rounded-xl'>
                Enter a query above to run cosine vector similarity search.
              </div>
            ) : (
              <div className='space-y-2.5 max-h-80 overflow-y-auto pr-1'>
                {searchResults.map((r, i) => (
                  <div
                    key={i}
                    className='p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/80 space-y-2 text-xs'
                  >
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <span className='px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'>
                          Score: {r.score.toFixed(2)}
                        </span>
                        {r.agentId && (
                          <span className='font-mono text-[11px] text-neutral-400 flex items-center gap-1'>
                            <Bot size={11} /> {r.agentId}
                          </span>
                        )}
                      </div>
                      <span className='text-[10px] text-neutral-400 font-mono'>
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className='text-neutral-200 leading-relaxed font-sans'>{r.content}</div>

                    {r.tags && r.tags.length > 0 && (
                      <div className='flex flex-wrap gap-1 pt-1'>
                        {r.tags.map((t) => (
                          <span
                            key={t}
                            className='inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-400'
                          >
                            <Tag size={9} /> {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
