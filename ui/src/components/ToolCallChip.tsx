import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import { LazySyntaxHighlighter } from './LazySyntaxHighlighter';

export interface ToolCallView {
  id: string;
  name: string;
  arguments: unknown;
  status?: 'running' | 'complete' | 'failed';
  output?: unknown;
}

type StatusKey = 'running' | 'complete' | 'failed';

const STATUS_META: Record<
  StatusKey,
  { Icon: typeof Check; spin: boolean; text: string; border: string; bg: string }
> = {
  running: {
    Icon: Loader2,
    spin: true,
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
  },
  complete: {
    Icon: Check,
    spin: false,
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
  },
  failed: {
    Icon: X,
    spin: false,
    text: 'text-rose-300',
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/5',
  },
};

const jsonStyle = {
  background: 'transparent',
  margin: 0,
  padding: 0,
  fontSize: '11px',
  lineHeight: '1.5',
};

/**
 * Inline chip in an assistant message bubble showing one DAG tool/task call:
 * name + live status, with collapsible arguments and output payloads.
 * Condition-skipped tasks arrive as `complete` with `{skipped: true, reason}`
 * output, which is visible here.
 */
export const ToolCallChip = ({ call }: { call: ToolCallView }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[(call.status || 'running') as StatusKey];
  const { Icon } = meta;
  const hasArgs = call.arguments !== undefined && call.arguments !== null;
  const hasOutput = call.output !== undefined && call.output !== null;
  const hasDetails = hasArgs || hasOutput;

  return (
    <div className={`rounded-lg border ${meta.border} ${meta.bg} overflow-hidden text-xs`}>
      <button
        onClick={() => hasDetails && setExpanded((e) => !e)}
        disabled={!hasDetails}
        className={`w-full px-3 py-2 flex items-center gap-2 font-mono text-[11px] ${
          hasDetails ? 'cursor-pointer hover:bg-neutral-900/60' : 'cursor-default'
        }`}
        title={hasDetails ? 'Toggle arguments & output' : undefined}
      >
        <Icon size={12} className={`${meta.text} shrink-0 ${meta.spin ? 'animate-spin' : ''}`} />
        <span className='text-neutral-200 font-semibold'>{call.name}</span>
        <span className={`text-[10px] uppercase tracking-wide ${meta.text}`}>
          {call.status || 'running'}
        </span>
        {hasDetails && (
          <span className='ml-auto text-neutral-500'>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        )}
      </button>

      {expanded && hasDetails && (
        <div className='px-3 py-2 border-t border-neutral-800/60 space-y-2 bg-neutral-950/70'>
          {hasArgs && (
            <div>
              <div className='text-[10px] font-mono uppercase text-neutral-500 mb-1'>Arguments</div>
              <div className='max-h-48 overflow-auto'>
                <LazySyntaxHighlighter language='json' customStyle={jsonStyle}>
                  {JSON.stringify(call.arguments, null, 2)}
                </LazySyntaxHighlighter>
              </div>
            </div>
          )}
          {hasOutput && (
            <div>
              <div className='text-[10px] font-mono uppercase text-neutral-500 mb-1'>Output</div>
              <div className='max-h-64 overflow-auto'>
                <LazySyntaxHighlighter
                  language='json'
                  customStyle={{ ...jsonStyle, color: meta.text }}
                >
                  {typeof call.output === 'string'
                    ? call.output
                    : JSON.stringify(call.output, null, 2)}
                </LazySyntaxHighlighter>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};