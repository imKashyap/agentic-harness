import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LazySyntaxHighlighter } from './LazySyntaxHighlighter';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  language?: string;
  value: string;
}

const CodeBlock = ({ language, value }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className='my-3 rounded-lg border border-neutral-800 bg-neutral-900/90 overflow-hidden text-xs'>
      <div className='flex items-center justify-between px-3 py-1.5 border-b border-neutral-800 bg-neutral-950/70'>
        <span className='font-mono text-[11px] text-neutral-400 font-semibold uppercase'>
          {language || 'text'}
        </span>
        <button
          onClick={handleCopy}
          className='flex items-center gap-1 text-[10px] text-neutral-400 hover:text-neutral-200 transition-colors bg-neutral-800/80 px-2 py-0.5 rounded border border-neutral-700/50'
          title='Copy code'
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
      <div className='max-h-96 overflow-auto p-2.5'>
        <LazySyntaxHighlighter
          language={language || 'text'}
          customStyle={{
            background: 'transparent',
            margin: 0,
            padding: 0,
            fontSize: '12px',
            lineHeight: '1.5',
          }}
        >
          {value}
        </LazySyntaxHighlighter>
      </div>
    </div>
  );
};

export const MarkdownRenderer = ({ content }: { content: string }) => {
  return (
    <div className='markdown-content space-y-2 text-xs leading-relaxed text-neutral-200'>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');
            const codeContent = String(children).replace(/\n$/, '');

            if (isInline) {
              return (
                <code
                  className='font-mono text-[11px] px-1.5 py-0.5 rounded bg-neutral-800 text-indigo-300 border border-neutral-700/60 font-medium'
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock
                language={match ? match[1] : undefined}
                value={codeContent}
              />
            );
          },
          p({ children }) {
            return <p className='leading-relaxed mb-2 last:mb-0'>{children}</p>;
          },
          h1({ children }) {
            return <h1 className='text-base font-bold text-white mt-4 mb-2 pb-1 border-b border-neutral-800'>{children}</h1>;
          },
          h2({ children }) {
            return <h2 className='text-sm font-bold text-white mt-3 mb-1.5'>{children}</h2>;
          },
          h3({ children }) {
            return <h3 className='text-xs font-bold text-neutral-100 mt-2 mb-1'>{children}</h3>;
          },
          ul({ children }) {
            return <ul className='list-disc list-inside space-y-1 my-2 pl-1'>{children}</ul>;
          },
          ol({ children }) {
            return <ol className='list-decimal list-inside space-y-1 my-2 pl-1'>{children}</ol>;
          },
          li({ children }) {
            return <li className='text-neutral-300'>{children}</li>;
          },
          blockquote({ children }) {
            return (
              <blockquote className='border-l-2 border-indigo-500 pl-3 py-1 my-2 text-neutral-400 italic bg-neutral-900/40 rounded-r'>
                {children}
              </blockquote>
            );
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target='_blank'
                rel='noopener noreferrer'
                className='text-indigo-400 hover:text-indigo-300 underline font-medium'
              >
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className='my-3 overflow-x-auto rounded-lg border border-neutral-800'>
                <table className='w-full text-left border-collapse text-xs'>{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className='bg-neutral-900 border-b border-neutral-800 font-semibold text-neutral-200'>{children}</thead>;
          },
          th({ children }) {
            return <th className='px-3 py-2 border-r border-neutral-800 last:border-r-0'>{children}</th>;
          },
          td({ children }) {
            return <td className='px-3 py-2 border-t border-r border-neutral-800 last:border-r-0 text-neutral-300'>{children}</td>;
          },
          hr() {
            return <hr className='my-3 border-neutral-800' />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
