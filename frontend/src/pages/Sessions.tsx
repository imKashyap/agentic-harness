import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Bot,
  User,
  Clock,
  Trash2,
  ArrowRight,
} from 'lucide-react';
import { getSessions, getSession, deleteSession } from '../api/sessions';

export const Sessions = () => {
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => getSessions(),
  });

  const { data: sessionDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['session', selectedSessionId],
    queryFn: () => getSession(selectedSessionId!),
    enabled: Boolean(selectedSessionId),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      if (selectedSessionId) setSelectedSessionId(null);
    },
  });

  if (isLoading) {
    return (
      <div className='flex items-center justify-center h-full text-xs text-neutral-400'>
        Loading conversation sessions...
      </div>
    );
  }

  if (error) {
    return (
      <div className='p-8 text-xs text-rose-400'>
        Error loading sessions: {(error as Error).message}
      </div>
    );
  }

  const sessions = data?.sessions || [];

  return (
    <div className='flex-1 overflow-y-auto p-8 space-y-6 max-w-7xl mx-auto w-full'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-white flex items-center gap-2.5'>
            <MessageSquare size={24} className='text-blue-400' />
            Conversations & Sessions
          </h1>
          <p className='text-xs text-neutral-400 mt-1'>
            Inspect multi-turn conversation states, active window compaction, and resume sessions.
          </p>
        </div>
        <span className='px-3 py-1 rounded-full text-xs font-mono bg-neutral-900 border border-neutral-800 text-neutral-300'>
          {sessions.length} Active Sessions
        </span>
      </div>

      {sessions.length === 0 ? (
        <div className='py-16 text-center text-xs text-neutral-400 border border-dashed border-neutral-800 rounded-2xl space-y-3'>
          <MessageSquare size={32} className='mx-auto opacity-30 text-neutral-400' />
          <div>No active conversation sessions found.</div>
          <Link
            to='/agents/default-agent'
            className='inline-block px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md'
          >
            Start a New Conversation
          </Link>
        </div>
      ) : (
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* Sessions List */}
          <div className='lg:col-span-1 space-y-2.5'>
            {sessions.map((s) => {
              const isSelected = selectedSessionId === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedSessionId(s.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-150 space-y-2 ${
                    isSelected
                      ? 'bg-neutral-850 border-indigo-500/60 shadow-lg shadow-indigo-500/10'
                      : 'bg-neutral-900/40 border-neutral-800/80 hover:border-neutral-700 hover:bg-neutral-900'
                  }`}
                >
                  <div className='flex items-center justify-between'>
                    <div className='font-mono font-bold text-xs text-white truncate max-w-[180px]'>
                      {s.id}
                    </div>
                    <span className='px-2 py-0.5 rounded text-[10px] font-mono bg-neutral-800 text-neutral-300 border border-neutral-700'>
                      {s.messageCount} msgs
                    </span>
                  </div>

                  <div className='flex items-center justify-between text-[11px] text-neutral-400'>
                    <span className='flex items-center gap-1 text-indigo-300 font-mono'>
                      <Bot size={12} /> {s.agentId}
                    </span>
                    <span className='flex items-center gap-1 font-mono text-[10px]'>
                      <Clock size={11} /> {new Date(s.updatedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Session Detail View */}
          <div className='lg:col-span-2'>
            {selectedSessionId ? (
              <div className='p-6 rounded-2xl border border-neutral-800/80 bg-neutral-900/40 space-y-4'>
                <div className='flex items-center justify-between border-b border-neutral-800 pb-3'>
                  <div>
                    <h3 className='font-bold text-sm text-white font-mono flex items-center gap-2'>
                      <span>Session: {selectedSessionId}</span>
                    </h3>
                    <div className='text-xs text-neutral-400 mt-0.5'>
                      Bound to Agent:{' '}
                      <span className='text-indigo-400 font-mono'>
                        {sessionDetail?.session?.agentId}
                      </span>
                    </div>
                  </div>

                  <div className='flex items-center gap-2'>
                    <button
                      onClick={() => {
                        if (confirm(`Delete session '${selectedSessionId}'?`)) {
                          deleteMutation.mutate(selectedSessionId);
                        }
                      }}
                      className='p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs flex items-center gap-1 transition-colors'
                      title='Delete Session'
                    >
                      <Trash2 size={14} />
                    </button>

                    <Link
                      to={`/agents/${sessionDetail?.session?.agentId || 'default-agent'}?sessionId=${selectedSessionId}`}
                      className='inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all'
                    >
                      <span>Resume Chat</span>
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>

                {isLoadingDetail ? (
                  <div className='py-8 text-center text-xs text-neutral-400'>
                    Loading messages...
                  </div>
                ) : (
                  <div className='space-y-3 max-h-[500px] overflow-y-auto pr-2'>
                    {sessionDetail?.session?.messages?.map((m, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl text-xs space-y-1 ${
                          m.role === 'user'
                            ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100 ml-8'
                            : m.role === 'assistant'
                            ? 'bg-neutral-900 border border-neutral-800 text-neutral-200 mr-8'
                            : 'bg-neutral-950 border border-neutral-800 text-neutral-400 font-mono text-[11px]'
                        }`}
                      >
                        <div className='flex items-center gap-1.5 font-bold text-[10px] uppercase font-mono tracking-wider opacity-70'>
                          {m.role === 'user' ? <User size={11} /> : <Bot size={11} />}
                          <span>{m.role}</span>
                        </div>
                        <div className='whitespace-pre-wrap leading-relaxed'>{m.content}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className='h-full flex items-center justify-center p-12 text-center text-xs text-neutral-400 border border-dashed border-neutral-800 rounded-2xl'>
                Select a session on the left to preview message history or resume chat.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
