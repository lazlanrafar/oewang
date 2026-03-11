import * as React from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/utils";

export interface MarkdownProps extends React.HTMLAttributes<HTMLDivElement> {
  content: string;
}

export function Markdown({ content, className, ...props }: MarkdownProps) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "prose-p:leading-relaxed prose-p:mb-4 last:prose-p:mb-0",
        "prose-strong:text-foreground prose-strong:font-bold",
        "prose-headings:text-foreground prose-headings:font-semibold prose-headings:mb-2",
        "prose-ul:my-4 prose-li:my-1",
        className,
      )}
      {...props}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
