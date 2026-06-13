import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

function MarkdownLink({ href, children, ...props }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="md-link"
      {...props}
    >
      {children}
    </a>
  );
}

/**
 * Shared Markdown renderer for the entire app.
 * Supports full GFM (tables, strikethrough, autolinks, task lists)
 * and sanitizes HTML for security.
 *
 * Note: react-markdown v9 removed the `className` prop.
 * We wrap in a div to apply our own class.
 */
export default function Markdown({ children, className = "" }) {
  return (
    <div className={`markdown-body ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: MarkdownLink,
        }}
      >
        {children || ""}
      </ReactMarkdown>
    </div>
  );
}
