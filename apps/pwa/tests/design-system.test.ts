import { expect, test } from "bun:test"
import { join } from "node:path"

const appRoot = join(import.meta.dir, "..")
const projectRoot = join(appRoot, "..", "..")
const sourceGlob = new Bun.Glob("src/showcase/**/*.{css,ts,tsx}")

async function readShowcaseSources(): Promise<
  readonly { readonly path: string; readonly text: string }[]
> {
  const sources: { path: string; text: string }[] = []
  for await (const path of sourceGlob.scan({ cwd: appRoot, onlyFiles: true })) {
    sources.push({ path, text: await Bun.file(join(appRoot, path)).text() })
  }
  return sources
}

test("defines the complete design contract before showcase implementation", async () => {
  // Given
  const design = await Bun.file(join(projectRoot, "DESIGN.md")).text()

  // When
  const sectionHeadings = Array.from(design.matchAll(/^## ([0-8])\./gmu), (match) => match[1])

  // Then
  expect(sectionHeadings).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8"])
  expect(design).toContain("| None | None | None |")
})

test("keeps visual source colors behind semantic tokens", async () => {
  // Given
  const sources = await readShowcaseSources()

  // When
  const rawColorFindings = sources.flatMap(({ path, text }) =>
    text
      .split("\n")
      .map((line, index) => ({ index: index + 1, line, path }))
      .filter(({ line }) => /#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\(/iu.test(line)),
  )
  const orphanOklch = sources.flatMap(({ path, text }) =>
    text
      .split("\n")
      .map((line, index) => ({ index: index + 1, line, path }))
      .filter(({ line }) => line.includes("oklch(") && !line.includes("--color-")),
  )

  // Then
  expect(sources.length).toBeGreaterThan(0)
  expect(rawColorFindings).toEqual([])
  expect(orphanOklch).toEqual([])
})

test("keeps the install icon inside the asset generator color subset", async () => {
  // Given
  const icon = await Bun.file(join(appRoot, "public", "icon.svg")).text()

  // When
  const semanticFills = Array.from(
    icon.matchAll(/\.(?:canvas|ink|accent|paper|sand)\s*\{\s*fill:/gu),
  )

  // Then
  expect(semanticFills).toHaveLength(5)
  expect(icon).not.toContain("oklch(")
  expect(icon).not.toMatch(/#[\da-f]{3,8}\b/iu)
})

test("publishes every generated install icon with a dedicated maskable asset", async () => {
  // Given
  const viteConfig = await Bun.file(join(appRoot, "vite.config.ts")).text()

  // When
  const iconSources = Array.from(
    viteConfig.matchAll(/src:\s*"\/(?:pwa-[^"]+|maskable-icon-[^"]+)"/gu),
  )

  // Then
  expect(viteConfig).toContain('"pwa-64x64.png"')
  expect(viteConfig).toContain('"maskable-icon-512x512.png"')
  expect(iconSources).toHaveLength(4)
  expect(viteConfig).not.toContain('purpose: "any maskable"')
})

test("publishes a valid crawler policy for the authenticated surface", async () => {
  // Given
  const robots = Bun.file(join(appRoot, "public", "robots.txt"))

  // When
  const exists = await robots.exists()
  const policy = exists ? await robots.text() : ""

  // Then
  expect(policy).toBe("User-agent: *\nAllow: /\n")
})

test("uses the required accessible primitive and icon libraries", async () => {
  // Given
  const sources = await readShowcaseSources()

  // When
  const sourceText = sources.map(({ text }) => text).join("\n")

  // Then
  expect(sourceText).toContain('from "@kobalte/core/')
  expect(sourceText).toContain('from "phosphor-solid"')
  expect(sourceText).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
})

test("wires component and Lighthouse verification without optional skips", async () => {
  // Given
  const rootPackage = await Bun.file(join(projectRoot, "package.json")).json()
  const pwaPackage = await Bun.file(join(appRoot, "package.json")).json()
  const auditScript = Bun.file(join(appRoot, "scripts", "audit-lighthouse.ts"))

  // When
  const auditScriptExists = await auditScript.exists()

  // Then
  expect(rootPackage.scripts["test:components"]).toBe("bun run --cwd apps/pwa test:components")
  expect(rootPackage.scripts["audit:lighthouse"]).not.toContain("--if-present")
  expect(pwaPackage.scripts["test:components"]).toContain("vitest run")
  expect(pwaPackage.scripts["audit:lighthouse"]).toContain("audit-lighthouse.ts")
  expect(auditScriptExists).toBe(true)
  expect(await auditScript.text()).toContain("await measure(chrome.port, preset, 0)")
})
