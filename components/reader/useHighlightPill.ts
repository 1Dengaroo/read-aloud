"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import { wordElement } from "@/components/reader/reading-dom";

/**
 * Drives the sliding highlight pill: positions the returned element
 * over the active word by setting the geometry vars that
 * styles/highlights.css transitions. Sliding only happens along a
 * line — a line jump, fresh appearance, or reflow repositions
 * instantly so the pill never sweeps diagonally.
 */
export function useHighlightPill(
  containerRef: RefObject<HTMLDivElement | null>,
  activeIndex: number,
  /** Re-measure when the rendered segments change identity. */
  content: unknown,
): RefObject<HTMLDivElement | null> {
  const pillRef = useRef<HTMLDivElement | null>(null);
  const pillTopRef = useRef<number | null>(null);
  const pillIndexRef = useRef(-1);

  const positionPill = useCallback(
    (markIndex: number, snap: boolean) => {
      const pill = pillRef.current;
      const container = containerRef.current;
      if (!pill || !container) return;
      if (markIndex < 0) {
        pill.style.opacity = "0";
        pillIndexRef.current = -1;
        return;
      }
      const word = wordElement(container, markIndex);
      if (!word) return;
      /*
       * Measure the word's first line fragment — a span can fragment
       * across lines (break after a hyphen), and the bounding box of the
       * fragments would stretch across both full lines.
       */
      const wordRect = word.getClientRects()[0];
      if (!wordRect) return;
      /*
       * A word inside a code section highlights the whole section as one
       * unit. A wrapped inline section has one rect per line — cover the
       * fragment on the word's line, never the multi-line bounding box.
       * Blocks are display:block, so their single rect is the whole box.
       */
      let rect = wordRect;
      const section = word.closest("[data-code]");
      if (section instanceof HTMLElement) {
        const centerY = (wordRect.top + wordRect.bottom) / 2;
        const fragment = Array.from(section.getClientRects()).find(
          (candidate) =>
            centerY >= candidate.top && centerY <= candidate.bottom,
        );
        rect = fragment ?? wordRect;
      }
      const containerRect = container.getBoundingClientRect();
      const x = rect.left - containerRect.left;
      const y = rect.top - containerRect.top;
      const instant =
        snap || pillIndexRef.current === -1 || y !== pillTopRef.current;
      pill.style.setProperty("--hl-duration", instant ? "0ms" : "150ms");
      pill.style.setProperty("--hl-x", `${x}px`);
      pill.style.setProperty("--hl-y", `${y}px`);
      pill.style.setProperty("--hl-w", `${rect.width}px`);
      pill.style.setProperty("--hl-h", `${rect.height}px`);
      pill.style.opacity = "1";
      pillTopRef.current = y;
      pillIndexRef.current = markIndex;
    },
    [containerRef],
  );

  useLayoutEffect(() => {
    positionPill(activeIndex, false);
  }, [activeIndex, content, positionPill]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() =>
      positionPill(pillIndexRef.current, true),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, positionPill]);

  return pillRef;
}
