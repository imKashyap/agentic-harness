import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy } from 'lucide-react';

export const JsonViewer = ({ data, title }: { data: unknown; title?: string }) => {
  const [copied, setCopied] = useState(false);
  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className='rounded-lg border border-neutral-800 bg-neutral-900/80 overflow-hidden text-xs'>
      <div className='flex items-center justify-between px-3 py-2 border-b border-neutral-800 bg-neutral-950/60'>
        <span className='font-mono text-[11px] text-neutral-400 font-medium'>
          {title || 'JSON Payload'}
        </span>
        <button
          onClick={handleCopy}
          className='flex items-center gap-1 text-[10px] text-neutral-400 hover:text-neutral-200 transition-colors bg-neutral-800/80 px-2 py-0.5 rounded border border-neutral-700/50'
          title='Copy JSON to clipboard'
        >
          {copied ? (
            <>
              <Check size={11} className='text-emerald-400' />
              <span className='text-emerald-400'>Copied</span>
            </>
          ) : (
            <>
              <Copy size={11} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className='max-h-72 overflow-auto p-2'>
        <SyntaxHighlighter
          language='json'
          style={vscDarkPlus}
          customStyle={{
            background: 'transparent',
            margin: 0,
            padding: '4px',
            fontSize: '11px',
            lineHeight: '1.4',
          }}
        >
          {jsonString}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};
