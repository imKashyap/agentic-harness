import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Bot,
  MessageSquare,
  CheckSquare,
  Zap,
  Clock,
  ArrowRight,
  TrendingUp,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import { getAgents } from '../api/agents';
import { getSessions } from '../api/sessions';
import { getApprovals } from '../api/approvals';
import { getCapabilities } from '../api/capabilities';
import { getHealth } from '../api/health';

export const Overview = () => {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 5000,
  });

  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: getAgents,
  });

  const { data: sessionsData } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => getSessions(),
    refetchInterval: 5000,
  });

  const { data: approvalsData } = useQuery({
    queryKey: ['approvals'],
    queryFn: getApprovals,
    refetchInterval: 5000,
  });

  const { data: capabilitiesData } = useQuery({
    queryKey: ['capabilities'],
    queryFn: getCapabilities,
  });

  const agents = agentsData?.agents || [];
  const sessions = sessionsData?.sessions || [];
  const pendingApprovals = approvalsData?.pending || [];
  const capabilities = capabilitiesData?.capabilities || [];
  const metrics = health?.metrics;

  const totalRuns = metrics?.totalRuns || 0;
  const successfulRuns = metrics?.successfulRuns || 0;
  const failedRuns = metrics?.failedRuns || 0;
  const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 100;
  const avgLatency = metrics?.averageDurationMs ? Math.round(metrics.averageDurationMs) : 0;

  return (
    <div className='flex-1 overflow-y-auto p-8 space-y-8 max-w-7xl mx-auto w-full'>
      {/* Hero Welcome Banner */}
      <div className='relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-r from-neutral-900 via-neutral-900/80 to-indigo-950/40 p-8 shadow-xl'>
        <div className='relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6'>
          <div className='space-y-2'>
            <div className='inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400'>
              <Sparkles size={13} />
              <span>Autonomous Agentic Orchestration</span>
            </div>
            <h1 className='text-3xl font-extrabold tracking-tight text-white'>
              Agentic Harness Control Center
            </h1>
            <p className='text-sm text-neutral-400 max-w-2xl leading-relaxed'>
              Enterprise-grade agent framework featuring DAG dependency execution, long-term vector memory,
              multi-tier LLM fallbacks, human-in-the-loop governance gates, and real-time streaming observability.
            </p>
          </div>

          <div className='flex flex-wrap gap-3 shrink-0'>
            <Link
              to='/agents/supervisor'
              className='inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95'
            >
              <Zap size={15} />
              <span>Launch Playground</span>
            </Link>
            <Link
              to='/approvals'
              className='inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-all'
            >
              <CheckSquare size={15} />
              <span>Review Approvals</span>
              {pendingApprovals.length > 0 && (
                <span className='px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-black'>
                  {pendingApprovals.length}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
        <div className='p-5 rounded-xl border border-neutral-800/80 bg-neutral-900/40 hover:border-neutral-700 transition-all'>
          <div className='flex items-center justify-between text-neutral-400'>
            <span className='text-xs font-medium uppercase tracking-wider font-mono'>Total Runs</span>
            <div className='w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400'>
              <Activity size={16} />
            </div>
          </div>
          <div className='mt-3 text-2xl font-extrabold text-white font-mono'>{totalRuns}</div>
          <div className='mt-1 text-xs text-neutral-400 flex items-center gap-1.5'>
            <span className='text-emerald-400 font-medium'>{successfulRuns} passed</span>
            {failedRuns > 0 && <span className='text-rose-400 font-medium'>• {failedRuns} failed</span>}
          </div>
        </div>

        <div className='p-5 rounded-xl border border-neutral-800/80 bg-neutral-900/40 hover:border-neutral-700 transition-all'>
          <div className='flex items-center justify-between text-neutral-400'>
            <span className='text-xs font-medium uppercase tracking-wider font-mono'>Success Rate</span>
            <div className='w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400'>
              <TrendingUp size={16} />
            </div>
          </div>
          <div className='mt-3 text-2xl font-extrabold text-white font-mono'>{successRate}%</div>
          <div className='mt-1 text-xs text-neutral-400 flex items-center gap-1'>
            <span className='text-neutral-400'>Fault-tolerant resilience</span>
          </div>
        </div>

        <div className='p-5 rounded-xl border border-neutral-800/80 bg-neutral-900/40 hover:border-neutral-700 transition-all'>
          <div className='flex items-center justify-between text-neutral-400'>
            <span className='text-xs font-medium uppercase tracking-wider font-mono'>Avg Latency</span>
            <div className='w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400'>
              <Clock size={16} />
            </div>
          </div>
          <div className='mt-3 text-2xl font-extrabold text-white font-mono'>{avgLatency}ms</div>
          <div className='mt-1 text-xs text-neutral-400'>Streaming & sync runs</div>
        </div>

        <div className='p-5 rounded-xl border border-neutral-800/80 bg-neutral-900/40 hover:border-neutral-700 transition-all'>
          <div className='flex items-center justify-between text-neutral-400'>
            <span className='text-xs font-medium uppercase tracking-wider font-mono'>Loaded Capabilities</span>
            <div className='w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400'>
              <Layers size={16} />
            </div>
          </div>
          <div className='mt-3 text-2xl font-extrabold text-white font-mono'>{capabilities.length}</div>
          <div className='mt-1 text-xs text-neutral-400'>Skills, Tools & Sub-Agents</div>
        </div>
      </div>

      {/* Agents & Quick Launch Section */}
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <div>
            <h2 className='text-lg font-bold text-white flex items-center gap-2'>
              <Bot size={18} className='text-indigo-400' />
              Registered Agents
            </h2>
            <p className='text-xs text-neutral-400'>
              Configured declarative agents available for interactive chat or multi-agent delegation.
            </p>
          </div>
          <Link
            to='/agents'
            className='text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1'
          >
            View All ({agents.length}) <ArrowRight size={13} />
          </Link>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
          {agents.map((agent) => (
            <div
              key={agent.id}
              className='p-5 rounded-xl border border-neutral-800/80 bg-neutral-900/30 hover:border-neutral-700 hover:bg-neutral-900/60 transition-all flex flex-col justify-between space-y-4 group'
            >
              <div className='space-y-2'>
                <div className='flex items-center justify-between'>
                  <div className='font-bold text-sm text-neutral-100 group-hover:text-indigo-300 transition-colors'>
                    {agent.name}
                  </div>
                  <span className='px-2 py-0.5 rounded text-[10px] font-mono bg-neutral-800 text-neutral-300 border border-neutral-700'>
                    {agent.id}
                  </span>
                </div>
                <p className='text-xs text-neutral-400 line-clamp-2 leading-relaxed'>
                  {agent.description}
                </p>
              </div>

              <div className='pt-2 border-t border-neutral-800/60 flex items-center justify-between text-xs'>
                <div className='text-[11px] text-neutral-400 font-mono'>
                  {agent.model?.provider || 'openrouter'} • {agent.model?.model || 'gemma-4-31b-it'}
                </div>
                <Link
                  to={`/agents/${agent.id}`}
                  className='inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-neutral-800 hover:bg-indigo-600 text-white transition-all'
                >
                  <span>Chat</span>
                  <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two Column Layout: Recent Sessions & Pending Approvals */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {/* Recent Sessions */}
        <div className='p-6 rounded-xl border border-neutral-800/80 bg-neutral-900/30 space-y-4'>
          <div className='flex items-center justify-between'>
            <h3 className='text-sm font-bold text-white flex items-center gap-2'>
              <MessageSquare size={16} className='text-blue-400' />
              Recent Conversations
            </h3>
            <Link
              to='/sessions'
              className='text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1'
            >
              Manage <ArrowRight size={12} />
            </Link>
          </div>

          {sessions.length === 0 ? (
            <div className='py-8 text-center text-xs text-neutral-400 border border-dashed border-neutral-800 rounded-lg'>
              No active conversational sessions found.
            </div>
          ) : (
            <div className='space-y-2'>
              {sessions.slice(0, 4).map((s) => (
                <div
                  key={s.id}
                  className='p-3 rounded-lg border border-neutral-800 bg-neutral-900/60 flex items-center justify-between text-xs'
                >
                  <div className='space-y-0.5'>
                    <div className='font-mono font-medium text-neutral-200'>{s.id}</div>
                    <div className='text-[11px] text-neutral-400'>
                      Agent: <span className='text-neutral-300'>{s.agentId}</span> • {s.messageCount} messages
                    </div>
                  </div>
                  <Link
                    to={`/agents/${s.agentId}?sessionId=${s.id}`}
                    className='px-2.5 py-1 text-[11px] rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors'
                  >
                    Resume
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Governance & Approvals */}
        <div className='p-6 rounded-xl border border-neutral-800/80 bg-neutral-900/30 space-y-4'>
          <div className='flex items-center justify-between'>
            <h3 className='text-sm font-bold text-white flex items-center gap-2'>
              <CheckSquare size={16} className='text-amber-400' />
              Pending Human Governance Checkpoints
            </h3>
            <Link
              to='/approvals'
              className='text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1'
            >
              All Approvals <ArrowRight size={12} />
            </Link>
          </div>

          {pendingApprovals.length === 0 ? (
            <div className='py-8 text-center text-xs text-neutral-400 border border-dashed border-neutral-800 rounded-lg'>
              All sensitive tool actions approved. No pending gates.
            </div>
          ) : (
            <div className='space-y-2'>
              {pendingApprovals.slice(0, 3).map((app) => (
                <div
                  key={app.id}
                  className='p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 flex items-center justify-between text-xs'
                >
                  <div className='space-y-0.5'>
                    <div className='font-bold text-amber-300 font-mono'>{app.capability}</div>
                    <div className='text-[11px] text-neutral-400 font-mono'>Run: {app.runId}</div>
                  </div>
                  <Link
                    to='/approvals'
                    className='px-2.5 py-1 text-[11px] font-semibold rounded bg-amber-500 text-black hover:bg-amber-400 transition-colors'
                  >
                    Review
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
