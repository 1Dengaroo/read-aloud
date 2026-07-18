import type { FontDefinition } from "@/lib/types";

/*
 * Each id maps to a [data-font="<id>"] block in styles/fonts.css that
 * sets --font-active. The family here must match that block — it is
 * what the settings dropdown uses to preview each option.
 */
export const fonts: FontDefinition[] = [
  { id: "default", name: "Default", family: "var(--font-default)" },
  { id: "serif", name: "Serif", family: "var(--font-serif)" },
  {
    id: "system",
    name: "System",
    family: "ui-sans-serif, system-ui, sans-serif",
  },
  { id: "dyslexic", name: "Dyslexic Friendly", family: "var(--font-dyslexic)" },
];

export const fontIds = fonts.map((f) => f.id);

export const defaultFontId = "default";

export function isFontId(id: string | undefined): id is string {
  return id !== undefined && fontIds.includes(id);
}
