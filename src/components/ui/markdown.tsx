import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy } from 'lucide-react';
import type { Components } from 'react-markdown';

// Language detection utility (borrowed from ReadToolWidget pattern)
const getLanguage = (className?: string): string => {
  if (!className) return 'text';

  const match = className.match(/language-(\w+)/);
  if (!match || !match[1]) return 'text';

  const lang = match[1].toLowerCase();
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    css: 'css',
    scss: 'scss',
    html: 'html',
    json: 'json',
    md: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    sh: 'bash',
    bash: 'bash',
    sql: 'sql',
  };

  return langMap[lang] || lang;
};

// Code block component with copy functionality and syntax highlighting
const CodeBlock = ({ children, className }: React.HTMLAttributes<HTMLElement>) => {
  const [copied, setCopied] = React.useState(false);
  const language = getLanguage(className);
  const code = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-4">
      {/* Language badge and copy button */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border border-b-0 rounded-t-lg">
        <span className="text-xs font-mono text-muted-foreground">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content with syntax highlighting */}
      <div className="rounded-b-lg overflow-hidden overflow-x-auto border border-muted">
        <SyntaxHighlighter
          language={language}
          style={oneDark}
          customStyle={{
            margin: 0,
            padding: '1rem',
            fontSize: '0.75rem', // 12px to match ReadToolWidget
            lineHeight: '1.6',
            borderRadius: 0,
          }}
          showLineNumbers
          wrapLines
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

// Inline code component
const InlineCode = ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
  <code
    className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm border border-muted-foreground/20"
    {...props}
  >
    {children}
  </code>
);

// Custom markdown component renderers matching shadcn/ui design system
export const markdownComponents: Partial<Components> = {
  // Headings with proper hierarchy and spacing
  h1: ({ children, ...props }) => (
    <h1 className="text-2xl font-bold mt-8 mb-4 first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-xl font-semibold mt-6 mb-4 first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-lg font-semibold mt-5 mb-4 first:mt-0" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="text-base font-semibold mt-4 mb-4 first:mt-0" {...props}>
      {children}
    </h4>
  ),
  h5: ({ children, ...props }) => (
    <h5 className="text-sm font-semibold mt-3 mb-2 first:mt-0" {...props}>
      {children}
    </h5>
  ),
  h6: ({ children, ...props }) => (
    <h6 className="text-sm font-semibold mt-3 mb-2 first:mt-0 text-muted-foreground" {...props}>
      {children}
    </h6>
  ),

  // Paragraphs with comfortable spacing
  p: ({ children, ...props }) => (
    <p className="mb-4 leading-relaxed last:mb-0" {...props}>
      {children}
    </p>
  ),

  // Links with primary color and hover effect
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-primary underline-offset-4 hover:underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),

  // Blockquotes with border accent
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground my-4"
      {...props}
    >
      {children}
    </blockquote>
  ),

  // Lists with proper spacing
  ul: ({ children, ...props }) => (
    <ul className="list-disc list-outside ml-6 mb-4 space-y-2" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal list-outside ml-6 mb-4 space-y-2" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-relaxed" {...props}>
      {children}
    </li>
  ),

  // Code blocks and inline code with syntax highlighting
  code: ({
    inline,
    className,
    children,
    ...props
  }: {
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
  }) => {
    return inline ? (
      <InlineCode className={className} {...props}>
        {children}
      </InlineCode>
    ) : (
      <CodeBlock className={className} {...props}>
        {children}
      </CodeBlock>
    );
  },

  // Pre tag (handled by code block)
  pre: ({ children }) => <>{children}</>,

  // Horizontal rule
  hr: ({ ...props }) => <hr className="my-6 border-border" {...props} />,

  // Tables (GFM support)
  table: ({ children, ...props }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse border border-border" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-muted/50" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => <tbody {...props}>{children}</tbody>,
  tr: ({ children, ...props }) => (
    <tr className="border-b border-border" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th className="px-4 py-2 text-left font-semibold text-sm" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-4 py-2 text-sm" {...props}>
      {children}
    </td>
  ),

  // Strikethrough (GFM)
  del: ({ children, ...props }) => (
    <del className="text-muted-foreground line-through" {...props}>
      {children}
    </del>
  ),

  // Strong and emphasis
  strong: ({ children, ...props }) => (
    <strong className="font-semibold" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),
};
