"use client";

import { useEffect } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import {
  themeIds,
  defaultThemeId,
  getThemeDefinition,
} from "@/lib/theme/theme-registry";

/*
 * Keeps a `.dark` class on <html> in sync with the active theme so
 * Tailwind's `dark:` variant works alongside [data-theme] tokens.
 */
function DarkClassManager() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) return;
    const definition = getThemeDefinition(resolvedTheme);
    document.documentElement.classList.toggle(
      "dark",
      definition?.isDark ?? false,
    );
  }, [resolvedTheme]);

  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme={defaultThemeId}
      themes={themeIds}
      enableSystem={false}
      disableTransitionOnChange
    >
      <DarkClassManager />
      {children}
    </NextThemesProvider>
  );
}
