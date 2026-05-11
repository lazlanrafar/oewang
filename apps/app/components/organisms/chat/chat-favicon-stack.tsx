"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BookIcon } from "lucide-react";

interface SourceItem {
  url: string;
  title: string;
}

interface FaviconStackProps {
  sources: SourceItem[];
}

/**
 * Get favicon URL for a given website URL
 */
function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return "";
  }
}

const handleOnClick = (href: string) => {
  window.open(href, "_blank");
};

export function ChatFaviconStack({ sources }: FaviconStackProps) {
  if (sources.length === 0) return null;

  return (
    <div className="not-prose mb-4 flex items-center">
      <div className="flex items-center">
        <AnimatePresence mode="popLayout">
          {sources.map((source, index) => (
            <motion.div
              key={source.url}
              initial={{
                opacity: 0,
                scale: 0.6,
                x: 50,
                filter: "blur(4px)",
              }}
              animate={{
                opacity: 1,
                scale: 1,
                x: 0,
                filter: "blur(0px)",
                zIndex: sources.length - index,
              }}
              exit={{
                opacity: 0,
                scale: 0.8,
                x: -20,
                filter: "blur(4px)",
              }}
              transition={{
                duration: 0.4,
                delay: index * 0.04,
                ease: [0.16, 1, 0.3, 1], // Custom easing for smooth motion
              }}
              className="-ml-2 relative first:ml-0"
              style={{ zIndex: sources.length - index }}
            >
              <button
                type="button"
                onClick={() => handleOnClick(source.url)}
                className="cursor-pointer border-none bg-transparent p-0 text-left"
              >
                <div className="relative flex h-5 w-5 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-border bg-background shadow-sm">
                  {/* biome-ignore lint/performance/noImgElement: Favicon is a small external image */}
                  <img
                    src={getFaviconUrl(source.url)}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      // Hide image and show fallback icon
                      const target = e.target as HTMLImageElement;
                      target.style.display = "none";
                      const parent = target.parentElement;
                      const fallback = parent.querySelector(".fallback-icon") as HTMLElement;
                      if (fallback) fallback.style.display = "block";
                    }}
                  />
                  <BookIcon
                    className="fallback-icon hidden h-3 w-3 text-muted-foreground"
                    style={{ display: "none" }}
                  />
                </div>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {sources.length > 0 && (
        <span className="ml-2 text-muted-foreground text-xs">
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </span>
      )}
    </div>
  );
}
