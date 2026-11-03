import { lazy, Suspense, type CSSProperties } from 'react';

/**
 * Lazily-loaded Prism syntax highlighter (vscDarkPlus theme).
 *
 * `react-syntax-highlighter` is one of the largest dependencies in the bundle;
 * wrapping it in React.lazy keeps it out of the initial chunk. The component
 * owns the style so call sites only pass language + customStyle.
 */
const Highlighter = lazy(async () => {
  const [{ Prism }, { default: vscDarkPlus }] = await Promise.all([
    import('react-syntax-highlighter'),
    // Deep import: pulling a single theme avoids loading the entire styles index.
    import('react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus'),
  ]);

  const StyledPrism = ({
    language,
    customStyle,
    children,
  }: {
    language?: string;
    customStyle?: CSSProperties;
    children: string;
  }) => (
    <Prism language={language || 'text'} style={vscDarkPlus} customStyle={customStyle}>
      {children}
    </Prism>
  );

  return { default: StyledPrism };
});

export const LazySyntaxHighlighter = ({
  language,
  customStyle,
  children,
}: {
  language?: string;
  customStyle?: CSSProperties;
  children: string;
}) => (
  <Suspense
    fallback={
      <pre className='font-mono text-xs text-neutral-200 whitespace-pre-wrap'>{children}</pre>
    }
  >
    <Highlighter language={language} customStyle={customStyle}>
      {children}
    </Highlighter>
  </Suspense>
);