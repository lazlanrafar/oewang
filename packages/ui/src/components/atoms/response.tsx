"use client";

import { Env } from "@workspace/constants";
import Link from "next/link";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";
import { cn } from "../../lib/utils";
import { Table } from "./table";

type ResponseProps = ComponentProps<typeof Streamdown>;

// Custom ul component with customizable className
const CustomUnorderedList = ({
  node,
  children,
  className,
  ...props
}: {
  node?: any;
  children?: React.ReactNode;
  className?: string;
}) => (
  <ul className={cn("list-disc space-y-1 pl-5 leading-relaxed marker:text-muted-foreground", className)} {...props}>
    {children}
  </ul>
);

// Custom ol component with customizable className
const CustomOrderedList = ({
  node,
  children,
  className,
  ...props
}: {
  node?: any;
  children?: React.ReactNode;
  className?: string;
}) => (
  <ol
    className={cn("list-decimal space-y-1 pl-5 leading-relaxed marker:text-muted-foreground", className)}
    {...props}
    data-streamdown="unordered-list"
  >
    {children}
  </ol>
);

// Custom li component
const CustomListItem = ({
  node,
  children,
  className,
  ...props
}: {
  node?: any;
  children?: React.ReactNode;
  className?: string;
}) => (
  <li className={cn("py-0 pl-1 leading-relaxed", className)} {...props} data-streamdown="list-item">
    {children}
  </li>
);

export const Response = memo(
  ({ className, ...props }: ResponseProps) => (
    <Streamdown
      className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 space-y-3", className)}
      components={{
        ul: ({ node, ref, ...props }) => <CustomUnorderedList {...props} />,
        ol: ({ node, ref, ...props }) => <CustomOrderedList {...props} />,
        li: ({ node, ref, ...props }) => <CustomListItem {...props} />,
        h1: ({ children, node, ref, ...props }) => (
          <h1 className="font-semibold text-base tracking-tight" {...props}>
            {children}
          </h1>
        ),
        h2: ({ children, node, ref, ...props }) => (
          <h2 className="font-semibold text-[0.95rem] tracking-tight" {...props}>
            {children}
          </h2>
        ),
        h3: ({ children, node, ref, ...props }) => (
          <h3 className="font-semibold text-sm text-primary tracking-wide" {...props}>
            {children}
          </h3>
        ),
        h4: ({ children, node, ref, ...props }) => (
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide" {...props}>
            {children}
          </h4>
        ),
        p: ({ children, node, ref, ...props }) => (
          <p className="leading-relaxed" {...props}>
            {children}
          </p>
        ),
        strong: ({ children, node, ref, ...props }) => (
          <strong className="font-semibold" {...props}>
            {children}
          </strong>
        ),
        em: ({ children, node, ref, ...props }) => (
          <em className="italic" {...props}>
            {children}
          </em>
        ),
        table: ({ node, ref, ...props }) => (
          <div className="relative overflow-x-auto">
            <Table {...props} className="border" />
          </div>
        ),
        a: ({ node, ref, ...props }) => {
          // if the href starts with the app url, open in the same window
          if (props.href?.startsWith(Env.NEXT_PUBLIC_APP_URL)) {
            return (
              <Link href={props.href} className="underline">
                {props.children}
              </Link>
            );
          }

          return <a {...props} />;
        },
      }}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

Response.displayName = "Response";
