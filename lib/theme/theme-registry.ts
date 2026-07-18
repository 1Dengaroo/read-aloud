import type { ThemeDefinition } from "@/lib/types";

/*
 * Ordered for the 3x2 settings grid: light themes first row,
 * dark themes second. Each id maps to a styles/themes/<id>.css file.
 */
export const themes: ThemeDefinition[] = [
  {
    id: "light",
    name: "Light",
    description: "Crisp white and blue",
    isDark: false,
  },
  {
    id: "slate",
    name: "Slate",
    description: "Soft neutral gray",
    isDark: false,
  },
  { id: "blush", name: "Blush", description: "Soft rose pink", isDark: false },
  { id: "dark", name: "Dark", description: "Charcoal and blue", isDark: true },
  {
    id: "black",
    name: "Black",
    description: "True black, max contrast",
    isDark: true,
  },
  {
    id: "lavender",
    name: "Lavender",
    description: "Violet night",
    isDark: true,
  },
];

export const themeIds = themes.map((t) => t.id);

export const defaultThemeId = "light";

export function getThemeDefinition(id: string): ThemeDefinition | undefined {
  return themes.find((t) => t.id === id);
}
