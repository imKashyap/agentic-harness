import { useState, useReducer, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  StopCircle,
  Bot,
  User,
  Brain,
  Users,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import { getAgents } from '../api/agents';
import { getSessions, getSession } from '../api/sessions';
import { streamAgentRun } from '../api/runs';
import { approveCheckpoint, rejectCheckpoint } from '../api/approvals';
import { ExecutionTimeline } from '../components/ExecutionTimeline';
import type { TimelineEvent } from '../components/ExecutionTimeline';
import { JsonViewer } from '../components/JsonViewer';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: unknown;
    status?: 'running' | 'complete' | 'failed';
    output?: unknown;
  }>;
  subAgents?: Array<{
    id: string;
    task: string;
    status?: 'running' | 'complete';
    response?: string;
  }>;
  recalledMemories?: string[];
  pendingApproval?: {
    approvalToken: string;
    capability: string;
    input: unknown;
  };
}

interface ChatState {
  messages: ChatMessage[];
  events: TimelineEvent[];
  status: 'idle' | 'running' | 'completed' | 'error';
  selectedEventData?: unknown;
  selectedEventIndex?: number | null;
  activeProgressMessage?: {
    stage: string;
    message: string;
    capability?: string;
    timestamp: number;
  };
  error?: string;
}

type Action =
  | { type: 'LOAD_HISTORY'; payload: ChatMessage[] }
  | { type: 'USER_SEND'; payload: { message: string } }
  | { type: 'SSE_EVENT'; event: string; data: any }
  | { type: 'SELECT_EVENT'; index: number }
  | { type: 'RESET_CHAT' }
  | { type: 'STOP_RUN' }
  | { type: 'SET_ERROR'; error: string };

const initialState: ChatState = {
  messages: [],
  events: [],
  status: 'idle',
  selectedEventIndex: null,
  activeProgressMessage: undefined,
};

function chatReducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'LOAD_HISTORY':
      return {
        ...state,
        messages: action.payload,
        status: 'idle',
      };

    case 'USER_SEND':
      return {
        ...state,
        status: 'running',
        activeProgressMessage: undefined,
        error: undefined,
        messages: [
          ...state.messages,
          { role: 'user', content: action.payload.message },
          { role: 'assistant', content: '', reasoning: '', toolCalls: [], subAgents: [] },
        ],
        events: [
          ...state.events,
          {
            type: 'run:start',
            label: 'Run initiated',
            timestamp: Date.now(),
            data: { input: action.payload.message },
          },
        ],
      };

    case 'SSE_EVENT': {
      const { event, data } = action;

      switch (event) {
        case 'progressive:message': {
          const newTimelineEvent: TimelineEvent = {
            type: 'progressive:message',
            label: data?.message || 'Progress update',
            timestamp: data?.timestamp || Date.now(),
            data,
          };
          return {
            ...state,
            activeProgressMessage: {
              stage: data?.stage || 'action',
              message: data?.message || 'Processing...',
              capability: data?.capability,
              timestamp: data?.timestamp || Date.now(),
            },
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'token:delta': {
          const deltaText = data?.delta || '';
          if (!deltaText) return state;

          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant') {
              return {
                ...msg,
                content: msg.content + deltaText,
              };
            }
            return msg;
          });
          return {
            ...state,
            activeProgressMessage: undefined,
            messages: updatedMessages,
          };
        }

        case 'thought:delta': {
          const deltaText = data?.delta || '';
          if (!deltaText) return state;

          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant') {
              return {
                ...msg,
                reasoning: (msg.reasoning || '') + deltaText,
              };
            }
            return msg;
          });
          return {
            ...state,
            messages: updatedMessages,
          };
        }

        case 'tool:call': {
          const calls = (data?.toolCalls || []).map((tc: any) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
            status: 'running' as const,
          }));

          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant') {
              return {
                ...msg,
                toolCalls: [...(msg.toolCalls || []), ...calls],
              };
            }
            return msg;
          });

          const newTimelineEvent: TimelineEvent = {
            type: 'tool:call',
            label: `Tool called: ${data?.toolCalls?.map((t: any) => t.name).join(', ')}`,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            messages: updatedMessages,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'task:complete': {
          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant' && msg.toolCalls) {
              return {
                ...msg,
                toolCalls: msg.toolCalls.map((tc) =>
                  tc.id === data?.taskId || tc.name === data?.capability
                    ? { ...tc, status: 'complete' as const, output: data?.output }
                    : tc
                ),
              };
            }
            return msg;
          });

          const newTimelineEvent: TimelineEvent = {
            type: 'task:complete',
            label: `Task completed: ${data?.capability}`,
            durationMs: data?.durationMs,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            messages: updatedMessages,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'task:failed': {
          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant' && msg.toolCalls) {
              return {
                ...msg,
                toolCalls: msg.toolCalls.map((tc) =>
                  tc.id === data?.taskId || tc.name === data?.capability
                    ? { ...tc, status: 'failed' as const, output: data?.error }
                    : tc
                ),
              };
            }
            return msg;
          });

          const newTimelineEvent: TimelineEvent = {
            type: 'task:failed',
            label: `Task failed: ${data?.capability}`,
            durationMs: data?.durationMs,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            messages: updatedMessages,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'subagent:delegated': {
          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant') {
              return {
                ...msg,
                subAgents: [
                  ...(msg.subAgents || []),
                  { id: data?.subAgentId, task: data?.task, status: 'running' as const },
                ],
              };
            }
            return msg;
          });

          const newTimelineEvent: TimelineEvent = {
            type: 'subagent:delegated',
            label: `Delegated to sub-agent: ${data?.subAgentId}`,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            messages: updatedMessages,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'subagent:completed': {
          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant' && msg.subAgents) {
              return {
                ...msg,
                subAgents: msg.subAgents.map((sa) =>
                  sa.id === data?.subAgentId
                    ? { ...sa, status: 'complete' as const, response: data?.response }
                    : sa
                ),
              };
            }
            return msg;
          });

          const newTimelineEvent: TimelineEvent = {
            type: 'subagent:completed',
            label: `Sub-agent completed: ${data?.subAgentId}`,
            durationMs: data?.durationMs,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            messages: updatedMessages,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'memory:recalled': {
          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant') {
              return {
                ...msg,
                recalledMemories: [
                  ...(msg.recalledMemories || []),
                  `Recalled ${data?.matchCount} memory items for: "${data?.query}"`,
                ],
              };
            }
            return msg;
          });

          const newTimelineEvent: TimelineEvent = {
            type: 'memory:recalled',
            label: `Memory recalled (${data?.matchCount} matches)`,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            messages: updatedMessages,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'hitl:approval_required': {
          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant') {
              return {
                ...msg,
                pendingApproval: {
                  approvalToken: data?.approvalToken,
                  capability: data?.capability,
                  input: data?.input,
                },
              };
            }
            return msg;
          });

          const newTimelineEvent: TimelineEvent = {
            type: 'hitl:approval_required',
            label: `Approval required for: ${data?.capability}`,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            messages: updatedMessages,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'run:end': {
          const newTimelineEvent: TimelineEvent = {
            type: 'run:end',
            label: `Run finished (${data?.durationMs || 0}ms)`,
            durationMs: data?.durationMs,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            status: 'completed',
            activeProgressMessage: undefined,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'run:error': {
          const newTimelineEvent: TimelineEvent = {
            type: 'run:error',
            label: `Error: ${data?.error || 'Execution failed'}`,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            status: 'error',
            error: data?.error || 'Unknown error occurred during agent run',
            activeProgressMessage: undefined,
            events: [...state.events, newTimelineEvent],
          };
        }

        default:
          return state;
      }
    }

    case 'SELECT_EVENT': {
      const event = state.events[action.index];
      return {
        ...state,
        selectedEventIndex: action.index,
        selectedEventData: event?.data ?? event,
      };
    }

    case 'RESET_CHAT':
      return initialState;

    case 'STOP_RUN':
      return {
        ...state,
        status: 'idle',
        activeProgressMessage: undefined,
      };

    case 'SET_ERROR':
      return {
        ...state,
        status: 'error',
        error: action.error,
      };

    default:
      return state;
  }
}

export const Chat = () => {
  const { id: routeAgentId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const currentAgentId = routeAgentId || 'supervisor-agent';
  const currentSessionId = searchParams.get('sessionId') || '';

  const [input, setInput] = useState('');
  const [enableMemory, setEnableMemory] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [expandedReasoning, setExpandedReasoning] = useState<Record<number, boolean>>({});
  const [state, dispatch] = useReducer(chatReducer, initialState);

  const abortControllerRef = useRef<AbortController | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Queries
  const { data: agentsData } = useQuery({ queryKey: ['agents'], queryFn: getAgents });
  const { data: sessionsData } = useQuery({
    queryKey: ['sessions', currentAgentId],
    queryFn: () => getSessions(currentAgentId),
  });

  const { data: sessionDetail } = useQuery({
    queryKey: ['session', currentSessionId],
    queryFn: () => getSession(currentSessionId),
    enabled: Boolean(currentSessionId),
  });

  // Load session messages when sessionDetail loads
  useEffect(() => {
    if (sessionDetail?.session?.messages) {
      const loaded: ChatMessage[] = sessionDetail.session.messages.map((m) => ({
        role: m.role as any,
        content: m.content || '',
        toolCalls: m.toolCalls?.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
          status: 'complete',
        })),
      }));
      dispatch({ type: 'LOAD_HISTORY', payload: loaded });
    }
  }, [sessionDetail]);

  // Auto-scroll on new messages or tokens
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  const handleAgentChange = (newAgentId: string) => {
    navigate(`/agents/${newAgentId}`);
    dispatch({ type: 'RESET_CHAT' });
  };

  const handleSessionChange = (newSessionId: string) => {
    if (newSessionId) {
      setSearchParams({ sessionId: newSessionId });
    } else {
      setSearchParams({});
      dispatch({ type: 'RESET_CHAT' });
    }
  };

  const handleSend = async () => {
    if (!input.trim() || state.status === 'running') return;

    const userPrompt = input.trim();
    setInput('');
    dispatch({ type: 'USER_SEND', payload: { message: userPrompt } });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await streamAgentRun(
        currentAgentId,
        {
          message: userPrompt,
          sessionId: currentSessionId || undefined,
          enableLongTermMemory: enableMemory,
        },
        (event, data) => {
          dispatch({ type: 'SSE_EVENT', event, data });
        },
        controller.signal
      );
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        dispatch({ type: 'SET_ERROR', error: err.message || 'Stream connection error' });
      }
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    dispatch({ type: 'STOP_RUN' });
  };

  const handleApprove = async (approvalToken: string) => {
    try {
      await approveCheckpoint(approvalToken, 'Approved via Chat UI');
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    } catch (err: any) {
      alert(`Approval error: ${err.message}`);
    }
  };

  const handleReject = async (approvalToken: string) => {
    try {
      await rejectCheckpoint(approvalToken, 'Rejected via Chat UI');
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    } catch (err: any) {
      alert(`Rejection error: ${err.message}`);
    }
  };

  const toggleReasoning = (msgIndex: number) => {
    setExpandedReasoning((prev) => ({ ...prev, [msgIndex]: !prev[msgIndex] }));
  };

  const agents = agentsData?.agents || [];
  const sessions = sessionsData?.sessions || [];
  const selectedAgent = agents.find((a) => a.id === currentAgentId);

  return (
    <div className='flex h-full w-full overflow-hidden bg-neutral-950 text-neutral-100'>
      {/* Main Chat Area */}
      <div className='flex-1 flex flex-col min-w-0 h-full'>
        {/* Top Control Bar */}
        <header className='px-6 py-3.5 border-b border-neutral-800/80 bg-neutral-900/40 backdrop-blur-md flex items-center justify-between gap-4 shrink-0'>
          <div className='flex items-center gap-3 min-w-0'>
            <div className='w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0'>
              <Bot size={18} />
            </div>
            <div className='min-w-0'>
              <div className='flex items-center gap-2'>
                <select
                  value={currentAgentId}
                  onChange={(e) => handleAgentChange(e.target.value)}
                  className='bg-neutral-800 border border-neutral-700 text-xs font-bold text-white rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500'
                >
                  {agents.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name} ({ag.id})
                    </option>
                  ))}
                </select>
                <span className='text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700'>
                  {selectedAgent?.model?.provider || 'openrouter'} : {selectedAgent?.model?.model || 'gemma-4-31b-it'}
                </span>
              </div>
            </div>
          </div>

          <div className='flex items-center gap-3'>
            {/* Session Selector */}
            <div className='flex items-center gap-1.5 text-xs text-neutral-400'>
              <select
                value={currentSessionId}
                onChange={(e) => handleSessionChange(e.target.value)}
                className='bg-neutral-800 border border-neutral-700 text-xs text-neutral-200 rounded-lg px-2.5 py-1 focus:outline-none'
              >
                <option value=''>Direct (No Session)</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    Session: {s.id} ({s.messageCount} msgs)
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const newId = `sess-${Date.now().toString(36)}`;
                  handleSessionChange(newId);
                }}
                className='p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700'
                title='Start New Session'
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Memory Toggle */}
            <label className='flex items-center gap-1.5 text-xs text-neutral-400 cursor-pointer bg-neutral-800/60 px-2.5 py-1 rounded-lg border border-neutral-700/60 select-none'>
              <Brain size={13} className={enableMemory ? 'text-indigo-400' : 'text-neutral-400'} />
              <span>Memory</span>
              <input
                type='checkbox'
                checked={enableMemory}
                onChange={(e) => setEnableMemory(e.target.checked)}
                className='rounded bg-neutral-700 border-neutral-600 text-indigo-500 focus:ring-0 cursor-pointer'
              />
            </label>

            {/* Clear Chat */}
            <button
              onClick={() => dispatch({ type: 'RESET_CHAT' })}
              className='p-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 border border-neutral-700/60 transition-colors'
              title='Reset conversation view'
            >
              <RotateCcw size={14} />
            </button>

            {/* Toggle Inspector Drawer */}
            <button
              onClick={() => setShowInspector(!showInspector)}
              className={`p-1.5 rounded-lg border transition-colors ${
                showInspector
                  ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/40'
                  : 'bg-neutral-800 text-neutral-400 border-neutral-700'
              }`}
              title='Toggle Trace & Inspector'
            >
              {showInspector ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </div>
        </header>

        {/* Message Stream View */}
        <div className='flex-1 overflow-y-auto p-6 space-y-6'>
          {state.messages.length === 0 ? (
            <div className='h-full flex flex-col items-center justify-center text-center p-8 space-y-4 max-w-md mx-auto opacity-80'>
              <div className='w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner'>
                <Sparkles size={28} />
              </div>
              <div className='space-y-1.5'>
                <h3 className='font-bold text-base text-neutral-200'>
                  {selectedAgent?.name || 'Agent Playground'}
                </h3>
                <p className='text-xs text-neutral-400 leading-relaxed'>
                  {selectedAgent?.description ||
                    'Send a prompt to execute multi-turn reasoning, tool calling, sub-agent delegation, and DAG orchestration.'}
                </p>
              </div>
              <div className='grid grid-cols-1 gap-2 w-full pt-2'>
                <button
                  onClick={() => setInput('Calculate (128 * 45) + 360 using the calculator tool.')}
                  className='text-left text-xs p-2.5 rounded-lg border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900 hover:border-neutral-700 text-neutral-300 transition-all'
                >
                  ⚡ <span className='font-mono text-indigo-300'>Tool Calling</span>: Calculate (128 * 45) + 360
                </button>
                <button
                  onClick={() => setInput('Please delegate research on modern agent architectures to the researcher agent.')}
                  className='text-left text-xs p-2.5 rounded-lg border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900 hover:border-neutral-700 text-neutral-300 transition-all'
                >
                  🤝 <span className='font-mono text-purple-300'>Delegation</span>: Delegate research to researcher
                </button>
              </div>
            </div>
          ) : (
            state.messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3.5 max-w-3xl ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                  }`}
                >
                  {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>

                {/* Message Bubble & Cards */}
                <div className='space-y-2 max-w-2xl'>
                  {/* Recalled Memory Pill */}
                  {msg.recalledMemories && msg.recalledMemories.length > 0 && (
                    <div className='flex flex-wrap gap-1.5'>
                      {msg.recalledMemories.map((rm, i) => (
                        <div
                          key={i}
                          className='inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-cyan-500/10 border border-cyan-500/20 text-cyan-300'
                        >
                          <Brain size={12} />
                          <span>{rm}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Deep Reasoning / Chain of Thought */}
                  {msg.reasoning && (
                    <div className='rounded-xl border border-neutral-800 bg-neutral-900/60 overflow-hidden text-xs'>
                      <button
                        onClick={() => toggleReasoning(idx)}
                        className='w-full px-3 py-2 flex items-center justify-between text-neutral-400 hover:text-neutral-200 bg-neutral-950/40 text-[11px] font-mono'
                      >
                        <span className='flex items-center gap-1.5'>
                          <Sparkles size={12} className='text-amber-400' />
                          <span>Chain-of-Thought Reasoning</span>
                        </span>
                        {expandedReasoning[idx] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      {expandedReasoning[idx] && (
                        <div className='p-3 text-neutral-300 font-mono text-[11px] leading-relaxed border-t border-neutral-800/60 whitespace-pre-wrap'>
                          {msg.reasoning}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sub-Agent Delegation Cards */}
                  {msg.subAgents && msg.subAgents.length > 0 && (
                    <div className='space-y-1.5'>
                      {msg.subAgents.map((sa, sIdx) => (
                        <div
                          key={sIdx}
                          className='p-2.5 rounded-lg border border-purple-500/30 bg-purple-500/5 text-xs space-y-1.5'
                        >
                          <div className='flex items-center justify-between'>
                            <span className='font-bold text-purple-300 flex items-center gap-1.5 font-mono'>
                              <Users size={13} /> Sub-Agent: {sa.id}
                            </span>
                            <span className='text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300'>
                              {sa.status || 'delegated'}
                            </span>
                          </div>
                          <div className='text-[11px] text-neutral-300'>Task: {sa.task}</div>
                          {sa.response && (
                            <div className='p-2.5 rounded bg-neutral-950 text-neutral-200 text-xs border border-purple-500/20'>
                              <MarkdownRenderer content={sa.response} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pending HITL Gate in Chat */}
                  {msg.pendingApproval && (
                    <div className='p-3.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs space-y-2.5'>
                      <div className='flex items-center gap-2 text-rose-300 font-bold'>
                        <ShieldAlert size={16} />
                        <span>Human-in-the-Loop Approval Required</span>
                      </div>
                      <div className='text-neutral-300'>
                        The agent is attempting sensitive tool:{' '}
                        <span className='font-mono font-bold text-white'>
                          {msg.pendingApproval.capability}
                        </span>
                      </div>
                      <div className='flex gap-2 pt-1'>
                        <button
                          onClick={() => handleApprove(msg.pendingApproval!.approvalToken)}
                          className='px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                        >
                          Approve Action
                        </button>
                        <button
                          onClick={() => handleReject(msg.pendingApproval!.approvalToken)}
                          className='px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md'
                        >
                          Reject Action
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Main Message Content */}
                  <div
                    className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-none shadow-md shadow-blue-600/10 whitespace-pre-wrap'
                        : 'bg-neutral-900 border border-neutral-800/80 text-neutral-200 rounded-tl-none shadow-md'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      msg.content ? (
                        <>
                          <MarkdownRenderer content={msg.content} />
                          {state.status === 'running' &&
                            idx === state.messages.length - 1 &&
                            state.activeProgressMessage && (
                              <div className='mt-2.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-500/10 border border-amber-500/25 text-amber-300 shadow-sm animate-pulse'>
                                <span className='relative flex h-2 w-2'>
                                  <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75'></span>
                                  <span className='relative inline-flex rounded-full h-2 w-2 bg-amber-500'></span>
                                </span>
                                <span>{state.activeProgressMessage.message}</span>
                              </div>
                            )}
                        </>
                      ) : state.status === 'running' && idx === state.messages.length - 1 ? (
                        state.activeProgressMessage ? (
                          <span className='inline-flex items-center gap-2 text-amber-300 font-medium'>
                            <span className='relative flex h-2 w-2'>
                              <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75'></span>
                              <span className='relative inline-flex rounded-full h-2 w-2 bg-amber-500'></span>
                            </span>
                            <span>{state.activeProgressMessage.message}</span>
                          </span>
                        ) : (
                          <span className='inline-flex items-center gap-1 text-neutral-400 italic'>
                            <span className='w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping' />
                            Thinking and streaming response...
                          </span>
                        )
                      ) : (
                        ''
                      )
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              </div>
            ))
          )}

          {state.error && (
            <div className='p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300 flex items-center gap-2'>
              <AlertTriangle size={15} />
              <span>{state.error}</span>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Input Bar */}
        <footer className='p-4 border-t border-neutral-800/80 bg-neutral-950/80 shrink-0'>
          <div className='max-w-3xl mx-auto flex items-center gap-2'>
            <input
              type='text'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={`Message ${selectedAgent?.name || 'agent'}... (Press Enter to send)`}
              disabled={state.status === 'running'}
              className='flex-1 bg-neutral-900 border border-neutral-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 text-xs text-white placeholder-neutral-500 focus:outline-none transition-colors'
            />

            {state.status === 'running' ? (
              <button
                onClick={handleStop}
                className='px-4 py-3 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 shadow-lg shadow-rose-600/20 transition-all'
              >
                <StopCircle size={15} />
                <span>Stop</span>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className='px-4 py-3 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition-all active:scale-95'
              >
                <Send size={15} />
                <span>Send</span>
              </button>
            )}
          </div>
        </footer>
      </div>

      {/* Right-Side Inspector Drawer */}
      {showInspector && (
        <aside className='w-80 border-l border-neutral-800/80 bg-neutral-950/90 flex flex-col shrink-0 h-full overflow-hidden'>
          <div className='p-3.5 border-b border-neutral-800 flex items-center justify-between text-xs font-bold text-neutral-300 font-mono'>
            <span>Execution Trace & DAG</span>
            <span className='text-[10px] font-normal text-neutral-400'>
              {state.events.length} events
            </span>
          </div>

          <div className='flex-1 overflow-y-auto p-4 space-y-4'>
            <ExecutionTimeline
              events={state.events}
              selectedEventIndex={state.selectedEventIndex}
              onSelectEvent={(idx) => dispatch({ type: 'SELECT_EVENT', index: idx })}
            />

            {state.selectedEventData !== undefined && (
              <div className='mt-4 pt-4 border-t border-neutral-800'>
                <JsonViewer
                  data={state.selectedEventData}
                  title={`Payload: ${state.events[state.selectedEventIndex || 0]?.type || 'Event'}`}
                />
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
};
