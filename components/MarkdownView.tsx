import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders AI-generated Markdown (headings, tables, lists) with Tailwind
 * typography styling. Used for the section-by-section analysis output.
 */
export default function MarkdownView({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-headings:text-slate-800 prose-table:text-xs prose-th:bg-slate-50">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
