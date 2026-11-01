import {
  Play,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Users,
  Brain,
  ShieldAlert,
  GitFork,
  Cpu,
  Clock,
  Sparkles,
} from 'lucide-react';

export interface TimelineEvent {
  id?: string;
  type: string;
  label: string;
  timestamp?: number;
  durationMs?: number;
  data?: unknown;
  status?: 'running' | 'success' | 'failed' | 'warning' | 'info';
}

interface ExecutionTimelineProps {
  events: TimelineEvent[];
  selectedEventIndex?: number | null;
  onSelectEvent?: (index: number) => void;
}

export const ExecutionTimeline = ({
  events,
  selectedEventIndex,
  onSelectEvent,
}: ExecutionTimelineProps) => {
  if (events.length === 0) {
    return (
      <div className='p-6 text-center text-neutral-400 text-xs border border-dashed border-neutral-800 rounded-xl'>
        <Cpu size={24} className='mx-auto mb-2 opacity-40 text-neutral-400' />
        <div>No execution trace yet.</div>
        <div className='text-[11px] mt-1 text-neutral-400'>
          Send a prompt to see real-time tool dispatch & DAG orchestration.
        </div>
      </div>
    );
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'run:start':
        return <Play size={13} className='text-blue-400' />;
      case 'run:end':
        return <CheckCircle2 size={13} className='text-emerald-400' />;
      case 'run:error':
      case 'task:failed':
        return <AlertTriangle size={13} className='text-red-400' />;
      case 'tool:call':
      case 'task:start':
      case 'task:complete':
        return <Wrench size={13} className='text-amber-400' />;
      case 'subagent:delegated':
      case 'subagent:completed':
        return <Users size={13} className='text-purple-400' />;
      case 'memory:recalled':
      case 'memory:stored':
        return <Brain size={13} className='text-cyan-400' />;
      case 'hitl:approval_required':
      case 'hitl:approved':
      case 'hitl:rejected':
        return <ShieldAlert size={13} className='text-rose-400' />;
      case 'plan:start':
      case 'plan:generated':
        return <GitFork size={13} className='text-indigo-400' />;
      case 'progressive:message':
        return <Sparkles size={13} className='text-amber-300' />;
      default:
        return <Clock size={13} className='text-neutral-400' />;
    }
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'run:start':
        return 'border-blue-500/30 bg-blue-500/10 text-blue-300';
      case 'run:end':
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
      case 'run:error':
      case 'task:failed':
        return 'border-red-500/30 bg-red-500/10 text-red-300';
      case 'tool:call':
      case 'task:complete':
        return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
      case 'subagent:delegated':
      case 'subagent:completed':
        return 'border-purple-500/30 bg-purple-500/10 text-purple-300';
      case 'memory:recalled':
        return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
      case 'hitl:approval_required':
        return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
      case 'progressive:message':
        return 'border-amber-400/30 bg-amber-400/10 text-amber-300';
      default:
        return 'border-neutral-700 bg-neutral-800 text-neutral-300';
    }
  };

  return (
    <div className='relative pl-4 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-800'>
      {events.map((evt, idx) => {
        const isSelected = selectedEventIndex === idx;
        return (
          <div
            key={idx}
            onClick={() => onSelectEvent?.(idx)}
            className={`relative group cursor-pointer transition-all duration-150 rounded-lg p-2.5 border text-xs ${
              isSelected
                ? 'bg-neutral-850 border-indigo-500/60 shadow-md shadow-indigo-500/10'
                : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900'
            }`}
          >
            {/* Timeline node dot */}
            <div className='absolute -left-[23px] top-3 w-3.5 h-3.5 rounded-full bg-neutral-950 border-2 border-neutral-700 flex items-center justify-center group-hover:border-indigo-400 transition-colors'>
              <div className='w-1.5 h-1.5 rounded-full bg-neutral-400 group-hover:bg-indigo-400' />
            </div>

            <div className='flex items-center justify-between gap-2'>
              <div className='flex items-center gap-2 font-medium text-neutral-200'>
                {getEventIcon(evt.type)}
                <span>{evt.label}</span>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border font-mono font-medium ${getBadgeColor(
                  evt.type
                )}`}
              >
                {evt.type}
              </span>
            </div>

            {evt.durationMs !== undefined && (
              <div className='mt-1 text-[11px] text-neutral-400 font-mono flex items-center gap-1'>
                <Clock size={11} /> {evt.durationMs}ms
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
