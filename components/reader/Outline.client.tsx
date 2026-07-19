"use client";

import type { OutlineHeading } from "@/lib/types";
import { cn } from "@/lib/utils";

interface OutlineProps {
  headings: OutlineHeading[];
  /** Index into `headings` of the section being read, or -1. */
  activeHeading: number;
  onSelect: (heading: OutlineHeading) => void;
}

/* Literal classes so Tailwind sees them; deeper levels share the max. */
const INDENT_BY_LEVEL: Record<number, string> = {
  1: "pl-3",
  2: "pl-5",
  3: "pl-7",
  4: "pl-9",
};

/**
 * Google-Docs-style document outline, fixed to the right of the reading
 * column on large screens. Clicking a heading scrolls to it and jumps
 * playback there (wired by the Reader).
 */
export function Outline({ headings, activeHeading, onSelect }: OutlineProps) {
  return (
    <nav
      aria-label="Document outline"
      className="animate-in fade-in fixed top-24 right-4 hidden max-h-[65vh] w-48 overflow-y-auto duration-500 min-[1440px]:block"
    >
      <ul className="border-edge-subtle flex flex-col gap-0.5 border-l">
        {headings.map((heading, index) => (
          <li key={index}>
            <button
              type="button"
              onClick={() => onSelect(heading)}
              title={heading.title}
              className={cn(
                "focus-visible:ring-ring/50 -ml-px block w-full truncate rounded-sm border-l-2 border-transparent py-1 pr-2 text-left text-xs transition-colors outline-none focus-visible:ring-3",
                INDENT_BY_LEVEL[Math.min(heading.level, 4)],
                index === activeHeading
                  ? "border-brand text-content-primary font-medium"
                  : "text-content-muted hover:text-content-secondary",
              )}
            >
              {heading.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
