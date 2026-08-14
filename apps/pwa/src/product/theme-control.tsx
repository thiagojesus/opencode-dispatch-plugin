import { Button } from "@kobalte/core/button"
import { Desktop, MoonStars, Sun } from "phosphor-solid"
import { createSignal, type JSX, onCleanup, onMount } from "solid-js"

import {
  applyThemePreference,
  nextThemePreference,
  readThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "./theme-preference"

const THEME_LABELS: Record<ThemePreference, string> = {
  dark: "Dark theme",
  light: "Light theme",
  system: "System theme",
}

function assertNever(value: never): never {
  throw new TypeError(`Unhandled theme preference: ${value}`)
}

function ThemeIcon(props: { readonly preference: ThemePreference }): JSX.Element {
  switch (props.preference) {
    case "system":
      return <Desktop aria-hidden="true" size={20} weight="bold" />
    case "light":
      return <Sun aria-hidden="true" size={20} weight="bold" />
    case "dark":
      return <MoonStars aria-hidden="true" size={20} weight="bold" />
    default:
      return assertNever(props.preference)
  }
}

export function ThemePreferenceButton(): JSX.Element {
  const [preference, setPreference] = createSignal(readThemePreference())
  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)")

  const applySystemChange = (): void => {
    if (preference() === "system") {
      applyThemePreference("system")
    }
  }

  onMount(() => {
    applyThemePreference(preference())
    colorScheme.addEventListener("change", applySystemChange)
  })

  onCleanup(() => {
    colorScheme.removeEventListener("change", applySystemChange)
  })

  const cyclePreference = (): void => {
    const nextPreference = nextThemePreference(preference())
    localStorage.setItem(THEME_STORAGE_KEY, nextPreference)
    setPreference(nextPreference)
    applyThemePreference(nextPreference)
  }

  return (
    <Button
      aria-label={`Theme preference: ${preference()}`}
      class="action action--ghost theme-control"
      onClick={cyclePreference}
      type="button"
    >
      <ThemeIcon preference={preference()} />
      <span>{THEME_LABELS[preference()]}</span>
    </Button>
  )
}
