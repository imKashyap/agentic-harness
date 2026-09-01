import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Bot,
  Wrench,
  Sparkles,
  Users,
  Code2,
  ArrowRight,
  Cpu,
  Sliders,
} from 'lucide-react';
import { getAgents } from '../api/agents';
import type { Agent } from '../api/agents';
import { JsonViewer } from '../components/JsonViewer';

export const Agents = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['agents'],
    queryFn: getAgents,
  });

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  if (isLoading) {
    return (
      <div className='flex items-center justify-center h-full text-xs text-neutral-400'>
        Loading agent catalog...
      </div>
    );
  }

  if (error) {
    return (
      <div className='p-8 text-xs text-rose-400'>
        Error loading agents: {(error as Error).message}
      </div>
    );
  }

  const agents = data?.agents || [];

  return (
    <div className='flex-1 overflow-y-auto p-8 space-y-6 max-w-7xl mx-auto w-full'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-white flex items-center gap-2.5'>
            <Bot size={24} className='text-indigo-400' />
            Agents Catalog
          </h1>
          <p className='text-xs text-neutral-400 mt-1'>
            Autonomous agents defined declarative in `agents/` with prompt templates and capability bindings.
          </p>
        </div>
        <span className='px-3 py-1 rounded-full text-xs font-mono bg-neutral-900 border border-neutral-800 text-neutral-300'>
          {agents.length} Registered Agents
        </span>
      </div>

      {/* Agents Grid */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'>
        {agents.map((agent) => (
          <div
            key={agent.id}
            className='p-5 rounded-xl border border-neutral-800/80 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-900/80 transition-all flex flex-col justify-between space-y-4'
          >
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <div className='w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold'>
                  <Bot size={18} />
                </div>
                <span className='px-2 py-0.5 rounded text-[10px] font-mono bg-neutral-800 text-neutral-400 border border-neutral-700'>
                  {agent.id}
                </span>
              </div>

              <div>
                <h2 className='text-base font-bold text-white'>{agent.name}</h2>
                <p className='text-xs text-neutral-400 mt-1 line-clamp-3 leading-relaxed'>
                  {agent.description}
                </p>
              </div>

              {/* Model & Runtime Badges */}
              <div className='space-y-1.5 pt-2 border-t border-neutral-800/60 text-xs'>
                <div className='flex items-center gap-1.5 text-neutral-400'>
                  <Cpu size={13} className='text-blue-400' />
                  <span className='font-mono text-[11px] text-neutral-300'>
                    {agent.model?.provider || 'openrouter'} / {agent.model?.model || 'gemma-4-31b-it'}
                  </span>
                </div>

                {agent.model?.generation && (
                  <div className='flex items-center gap-1.5 text-[11px] text-neutral-400 font-mono'>
                    <Sliders size={13} className='text-amber-400' />
                    <span>
                      temp: {agent.model.generation.temperature ?? 0.7} • max_tokens: {agent.model.generation.maxTokens ?? 1024}
                    </span>
                  </div>
                )}
              </div>

              {/* Bound Capabilities Chips */}
              <div className='flex flex-wrap gap-1.5 pt-1'>
                {agent.skills && agent.skills.map((s) => (
                  <span key={s} className='inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'>
                    <Sparkles size={10} /> {s}
                  </span>
                ))}
                {agent.tools && agent.tools.map((t) => (
                  <span key={t} className='inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300'>
                    <Wrench size={10} /> {t}
                  </span>
                ))}
                {agent.subAgents && agent.subAgents.map((sa) => (
                  <span key={sa} className='inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300'>
                    <Users size={10} /> {sa}
                  </span>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className='pt-3 border-t border-neutral-800/80 flex items-center justify-between gap-2'>
              <button
                onClick={() => setSelectedAgent(agent)}
                className='px-3 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white bg-neutral-800/80 hover:bg-neutral-800 border border-neutral-700/60 flex items-center gap-1 transition-colors'
              >
                <Code2 size={13} />
                <span>Definition</span>
              </button>

              <Link
                to={`/agents/${agent.id}`}
                className='inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all'
              >
                <span>Launch Chat</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* JSON Definition Modal */}
      {selectedAgent && (
        <div className='fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4'>
          <div className='bg-neutral-900 border border-neutral-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl'>
            <div className='flex items-center justify-between border-b border-neutral-800 pb-3'>
              <div className='flex items-center gap-2'>
                <Bot size={18} className='text-indigo-400' />
                <h3 className='font-bold text-sm text-white'>
                  {selectedAgent.name} (`{selectedAgent.id}`)
                </h3>
              </div>
              <button
                onClick={() => setSelectedAgent(null)}
                className='text-neutral-400 hover:text-white text-xs px-2 py-1 rounded bg-neutral-800'
              >
                Close
              </button>
            </div>

            <JsonViewer data={selectedAgent} title='agent.json configuration' />
          </div>
        </div>
      )}
    </div>
  );
};
