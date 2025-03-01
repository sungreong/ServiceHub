// frontend/src/components/MarkdownRenderer.tsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

// code 컴포넌트용 커스텀 타입 정의
interface CodeProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  [key: string]: any;
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  if (!content) {
    return <div className="text-gray-500 italic">내용이 없습니다.</div>;
  }

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={{
          // 커스텀 컴포넌트 스타일링
          h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-6 mb-4 pb-2 border-b" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-xl font-bold mt-5 mb-3" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-lg font-bold mt-4 mb-2" {...props} />,
          p: ({ node, ...props }) => <p className="mb-4" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-8 mb-4" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-8 mb-4" {...props} />,
          li: ({ node, ...props }) => <li className="mb-1" {...props} />,
          a: ({ node, ...props }) => <a className="text-blue-600 hover:underline" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-gray-300 pl-4 py-1 italic text-gray-700 my-4" {...props} />
          ),
          code: (props: any) => {
            const { inline, className, children, ...rest } = props as CodeProps;
            
            if (inline) {
              return (
                <code className="bg-gray-100 px-1 py-0.5 rounded text-red-600 font-mono text-sm" {...rest}>
                  {children}
                </code>
              );
            }
            return (
              <pre className="bg-gray-100 rounded p-4 overflow-x-auto mb-4">
                <code className="font-mono text-sm whitespace-pre" {...rest}>
                  {children}
                </code>
              </pre>
            );
          },
          table: ({ node, ...props }) => <table className="min-w-full border border-gray-300 mb-4" {...props} />,
          thead: ({ node, ...props }) => <thead className="bg-gray-100" {...props} />,
          tbody: ({ node, ...props }) => <tbody className="divide-y divide-gray-300" {...props} />,
          tr: ({ node, ...props }) => <tr className="divide-x divide-gray-300" {...props} />,
          th: ({ node, ...props }) => <th className="px-4 py-2 text-left font-semibold" {...props} />,
          td: ({ node, ...props }) => <td className="px-4 py-2" {...props} />,
          hr: ({ node, ...props }) => <hr className="my-6 border-gray-300" {...props} />,
          img: ({ node, ...props }) => <img className="max-w-full h-auto my-4 rounded" {...props} />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;