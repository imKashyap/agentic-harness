import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Wrench,
  Sparkles,
  Bot,
  Search,
  ShieldAlert,
  Code2,
  Layers,
} from 'lucide-react';
import { getCapabilities } from '../api/capabilities';
import type { CapabilityItem } from '../api/capabilities';
import { JsonViewer } from '../components/JsonViewer';

export const Capabilities = () => {
  const [filterType, setFilterType] = useState<'all' | 'skill' | 'tool' | 'agent'>('all');
  const [search, setSearch] = useState('');
  const [selectedCap, setSelectedCap] = useState<CapabilityItem | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['capabilities'],
    queryFn: getCapabilities,
  });

  if (isLoading) {
    return (
      <div className='flex items-center justify-center h-full text-xs text-neutral-400'>
        Loading capabilities catalog...
      </div>
    );
  }

  if (error) {
    return (
      <div className='p-8 text-xs text-rose-400'>
        Error loading capabilities: {(error as Error).message}
      </div>
    );
  }

  const allCapabilities = data?.capabilities || [];

  const filtered = allCapabilities.filter((c) => {
    const matchesType = filterType === 'all' || c.type === filterType;
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(search.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'skill':
        return <Sparkles size={16} className='text-emerald-400' />;
      case 'tool':
        return <Wrench size={16} className='text-amber-400' />;
      case 'agent':
        return <Bot size={16} className='text-purple-400' />;
      default:
        return <Layers size={16} className='text-neutral-400' />;
    }
  };

  return (
    <div className='flex-1 overflow-y-auto p-8 space-y-6 max-w-7xl mx-auto w-full'>
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-bold text-white flex items-center gap-2.5'>
            <Wrench size={24} className='text-amber-400' />
            Capabilities Catalog
          </h1>
          <p className='text-xs text-neutral-400 mt-1'>
            Registry of all discovered skills, tools, and sub-agents dynamically loaded into the harness.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className='flex items-center gap-1 bg-neutral-900/80 p-1 rounded-xl border border-neutral-800 self-start text-xs'>
          {(['all', 'skill', 'tool', 'agent'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterType(tab)}
              className={`px-3 py-1.5 rounded-lg font-medium capitalize transition-colors ${
                filterType === tab
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {tab === 'all' ? 'All Types' : `${tab}s`}
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar */}
      <div className='relative'>
        <Search size={15} className='absolute left-3.5 top-3 text-neutral-500' />
        <input
          type='text'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder='Filter capabilities by ID, name, or description...'
          className='w-full bg-neutral-900/60 border border-neutral-800 focus:border-amber-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none'
        />
      </div>

      {/* Capabilities Grid */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
        {filtered.map((cap) => (
          <div
            key={cap.id}
            className='p-5 rounded-xl border border-neutral-800/80 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-900/80 transition-all flex flex-col justify-between space-y-4'
          >
            <div className='space-y-2.5'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <div className='w-7 h-7 rounded-lg bg-neutral-800 flex items-center justify-center'>
                    {getIcon(cap.type)}
                  </div>
                  <span className='font-bold text-sm text-neutral-100'>{cap.name}</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                    cap.type === 'skill'
                      ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                      : cap.type === 'tool'
                      ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                      : 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                  }`}
                >
                  {cap.type}
                </span>
              </div>

              <div className='font-mono text-[11px] text-neutral-400'>{cap.id}</div>
              <p className='text-xs text-neutral-400 line-clamp-3 leading-relaxed'>
                {cap.description || 'No description provided.'}
              </p>

              {cap.requiresApproval && (
                <div className='inline-flex items-center gap-1 text-[10px] font-semibold text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20'>
                  <ShieldAlert size={11} /> Requires Human Approval
                </div>
              )}
            </div>

            <div className='pt-2 border-t border-neutral-800/60 flex items-center justify-between'>
              <button
                onClick={() => setSelectedCap(cap)}
                className='text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium'
              >
                <Code2 size={13} /> View Schema & Metadata
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Schema / Details Modal */}
      {selectedCap && (
        <div className='fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4'>
          <div className='bg-neutral-900 border border-neutral-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl'>
            <div className='flex items-center justify-between border-b border-neutral-800 pb-3'>
              <div className='flex items-center gap-2'>
                {getIcon(selectedCap.type)}
                <h3 className='font-bold text-sm text-white'>
                  {selectedCap.name} (`{selectedCap.id}`)
                </h3>
              </div>
              <button
                onClick={() => setSelectedCap(null)}
                className='text-neutral-400 hover:text-white text-xs px-2 py-1 rounded bg-neutral-800'
              >
                Close
              </button>
            </div>

            <div className='space-y-3 text-xs'>
              <div>
                <span className='text-neutral-400 font-medium'>Description: </span>
                <span className='text-neutral-200'>{selectedCap.description}</span>
              </div>
              <JsonViewer data={selectedCap} title='Capability Metadata & Schema' />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
