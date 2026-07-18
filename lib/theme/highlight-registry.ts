import type { HighlightDefinition } from "@/lib/types";

/*
 * Each id maps to a [data-highlight="<id>"] block in styles/highlights.css
 * that resolves --highlight-active / --highlight-active-foreground /
 * --highlight-sentence from the active theme's tokens.
 */
export const highlights: HighlightDefinition[] = [
  { id: "yellow", name: "Yellow" },
  { id: "accent", name: "Theme" },
  { id: "underline", name: "Underline" },
];

export const highlightIds = highlights.map((h) => h.id);

export const defaultHighlightId = "yellow";

export function isHighlightId(id: string | undefined): id is string {
  return id !== undefined && highlightIds.includes(id);
}
