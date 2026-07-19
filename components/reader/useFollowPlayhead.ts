"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { wordElement } from "@/components/reader/reading-dom";

export interface FollowPlayhead {
  /** False once the user has scrolled the active word off screen. */
  playheadVisible: boolean;
  /** Whether the playhead left below the viewport (for the arrow). */
  playheadBelow: boolean;
  scrollToPlayhead: () => void;
  /** Skip the next auto-scroll so a manual jump's own scroll wins. */
  suppressNextAutoScroll: () => void;
}

/**
 * Auto-follow for the reading surface. The active word is kept in view
 * while it is on screen; once the user scrolls it away, following stops
 * (no yanking) and `playheadVisible` turns false so the Reader can show
 * a "Back to playhead" affordance. Scrolling the word back into view —
 * by that button or by hand — re-engages following.
 */
export function useFollowPlayhead(
  containerRef: RefObject<HTMLDivElement | null>,
  activeIndex: number,
  enabled: boolean,
): FollowPlayhead {
  const [playheadVisible, setPlayheadVisible] = useState(true);
  const [playheadBelow, setPlayheadBelow] = useState(false);
  /** Mirrors `playheadVisible` for the auto-scroll effect's gate. */
  const visibleRef = useRef(true);
  const suppressRef = useRef(false);

  useEffect(() => {
    const setVisible = (visible: boolean) => {
      visibleRef.current = visible;
      setPlayheadVisible(visible);
    };
    if (!enabled || activeIndex < 0) {
      setVisible(true);
      return;
    }
    const word = wordElement(containerRef.current, activeIndex);
    if (!word) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (!entry.isIntersecting) {
          setPlayheadBelow(
            entry.boundingClientRect.top >
              (entry.rootBounds?.bottom ?? window.innerHeight),
          );
        }
      },
      // Words tucked behind the header or the player dock count as gone.
      { rootMargin: "-16px 0px -88px 0px" },
    );
    observer.observe(word);
    return () => observer.disconnect();
  }, [enabled, activeIndex, containerRef]);

  useEffect(() => {
    if (activeIndex < 0) return;
    if (suppressRef.current) {
      suppressRef.current = false;
      return;
    }
    // The user scrolled the playhead off screen — let them read freely.
    if (!visibleRef.current) return;
    wordElement(containerRef.current, activeIndex)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeIndex, containerRef]);

  return {
    playheadVisible,
    playheadBelow,
    scrollToPlayhead: () =>
      wordElement(containerRef.current, activeIndex)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      }),
    suppressNextAutoScroll: () => {
      suppressRef.current = true;
    },
  };
}
