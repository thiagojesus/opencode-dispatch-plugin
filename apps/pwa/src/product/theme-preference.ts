export const THEME_STORAGE_KEY = "opencode-dispatch-theme"

export type ThemePreference = "dark" | "light" | "system"
export type ResolvedTheme = Exclude<ThemePreference, "system">

export function parseThemePreference(value: string | null): ThemePreference {
  switch (value) {
    case "dark":
      return "dark"
    case "light":
      return "light"
    case "system":
      return "system"
    default:
      return "system"
  }
}

export function nextThemePreference(preference: ThemePreference): ThemePreference {
  switch (preference) {
    case "system":
      return "light"
    case "light":
      return "dark"
    case "dark":
      return "system"
  }
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  switch (preference) {
    case "system":
      return systemDark ? "dark" : "light"
    case "light":
      return "light"
    case "dark":
      return "dark"
  }
}

export function readThemePreference(): ThemePreference {
  return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY))
}

export function applyThemePreference(preference: ThemePreference): void {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  document.documentElement.setAttribute("data-theme", resolveTheme(preference, systemDark))
}

export function applyInitialTheme(): void {
  applyThemePreference(readThemePreference())
}
