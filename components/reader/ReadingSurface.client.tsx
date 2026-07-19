"use client";

import { Fragment, useMemo, type RefObject } from "react";
import { useHighlightPill } from "@/components/reader/useHighlightPill";
import { buildSegmentRuns, groupSegmentsByCode } from "@/lib/markdown";
import { buildCharStartByMark, buildSentenceByMark } from "@/lib/synthesis";
import type { MarkdownAnnotations, StyledRun, WordSegment } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ReadingSurfaceProps {
  segments: WordSegment[];
  markdown: MarkdownAnnotations | null;
  /** Speech-mark index of the word being spoken, or -1. */
  activeIndex: number;
  /** Shared with the Reader so it can scroll words into view. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** A word span was clicked — seek playback to it. */
  onWordSelect: (markIndex: number) => void;
}

/** A segment's children: plain text, or markdown-styled sub-runs. */
function renderSegmentContent(
  runs: StyledRun[] | null | undefined,
  text: string,
) {
  if (!runs) return text;
  return runs.map((run, index) => (
    <span key={index} className={run.className ?? undefined}>
      {run.text}
    </span>
  ));
}

/**
 * The followed text itself: word spans (tagged data-mark for seeking
 * and scrolling), markdown styling, the active-sentence tint, and the
 * sliding highlight pill. Playback is someone else's problem — this
 * component only maps (segments, activeIndex) to DOM.
 */
export function ReadingSurface({
  segments,
  markdown,
  activeIndex,
  containerRef,
  onWordSelect,
}: ReadingSurfaceProps) {
  const pillRef = useHighlightPill(containerRef, activeIndex, segments);

  const sentenceByMark = useMemo(
    () => buildSentenceByMark(segments),
    [segments],
  );
  const activeSentence = activeIndex >= 0 ? sentenceByMark[activeIndex] : -1;

  const segmentRuns = useMemo(
    () => (markdown ? buildSegmentRuns(segments, markdown.decorations) : []),
    [segments, markdown],
  );
  // Code sections render as one wrapper each — one chip, one highlight.
  const segmentGroups = useMemo(
    () => groupSegmentsByCode(segments, markdown?.codeRanges ?? []),
    [segments, markdown],
  );
  const charStartByMark = useMemo(
    () => buildCharStartByMark(segments),
    [segments],
  );
  const activeCodeIndex =
    activeIndex >= 0 && markdown
      ? markdown.codeRanges.findIndex(
          (range) =>
            charStartByMark[activeIndex] >= range.start &&
            charStartByMark[activeIndex] < range.end,
        )
      : -1;

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    const span = event.target.closest("[data-mark]");
    if (!(span instanceof HTMLElement)) return;
    onWordSelect(Number(span.dataset.mark));
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      aria-live="off"
      className="reading-surface relative isolate text-lg leading-8 whitespace-pre-wrap sm:text-xl sm:leading-9"
    >
      <div
        ref={pillRef}
        aria-hidden
        className="reading-pill pointer-events-none absolute top-0 left-0 -z-10"
      />
      {segmentGroups.map((group, groupIndex) => {
        const spans = segments
          .slice(group.from, group.to)
          .map((segment, offset) => {
            const index = group.from + offset;
            /*
             * No transition on the tint: a 150ms crossfade makes every
             * sentence switch dip through half-tinted (the old sentence
             * fading out while the new fades in), which reads as a
             * flash between the two lines. One crisp repaint instead.
             */
            return segment.markIndex === null ? (
              <span
                key={index}
                className={cn(
                  segment.sentenceIndex >= 0 &&
                    segment.sentenceIndex === activeSentence &&
                    "bg-hl-sentence",
                )}
              >
                {renderSegmentContent(segmentRuns[index], segment.text)}
              </span>
            ) : (
              <span
                key={index}
                data-mark={segment.markIndex}
                className={cn(
                  segment.sentenceIndex === activeSentence && "bg-hl-sentence",
                  segment.markIndex === activeIndex &&
                    "text-hl-active-foreground",
                )}
              >
                {renderSegmentContent(segmentRuns[index], segment.text)}
              </span>
            );
          });
        if (group.codeIndex === null) {
          return <Fragment key={groupIndex}>{spans}</Fragment>;
        }
        return (
          <span
            key={groupIndex}
            data-code={group.codeIndex}
            data-active={group.codeIndex === activeCodeIndex || undefined}
            className={cn(
              markdown?.codeRanges[group.codeIndex]?.block
                ? "md-code-block"
                : "md-code-chip",
              group.codeIndex === activeCodeIndex &&
                "text-hl-active-foreground",
            )}
          >
            {spans}
          </span>
        );
      })}
    </div>
  );
}
