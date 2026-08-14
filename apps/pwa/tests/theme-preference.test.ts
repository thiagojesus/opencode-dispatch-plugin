import { expect, test } from "bun:test"

import {
  nextThemePreference,
  parseThemePreference,
  resolveTheme,
} from "../src/product/theme-preference"

test("defaults an unknown stored theme to the system preference", () => {
  // Given
  const storedValue = "sepia"

  // When
  const preference = parseThemePreference(storedValue)

  // Then
  expect(preference).toBe("system")
})

test("advances the system theme preference to light", () => {
  // Given
  const preference = "system" as const

  // When
  const nextPreference = nextThemePreference(preference)

  // Then
  expect(nextPreference).toBe("light")
})

test("advances the light theme preference to dark", () => {
  // Given
  const preference = "light" as const

  // When
  const nextPreference = nextThemePreference(preference)

  // Then
  expect(nextPreference).toBe("dark")
})

test("advances the dark theme preference to system", () => {
  // Given
  const preference = "dark" as const

  // When
  const nextPreference = nextThemePreference(preference)

  // Then
  expect(nextPreference).toBe("system")
})

test("resolves the system preference to light when the system is light", () => {
  // Given
  const preference = "system" as const

  // When
  const resolved = resolveTheme(preference, false)

  // Then
  expect(resolved).toBe("light")
})

test("resolves the system preference to dark when the system is dark", () => {
  // Given
  const preference = "system" as const

  // When
  const resolved = resolveTheme(preference, true)

  // Then
  expect(resolved).toBe("dark")
})
