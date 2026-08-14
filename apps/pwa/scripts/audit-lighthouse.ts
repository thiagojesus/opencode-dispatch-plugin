import { resolve } from "node:path"
import { launch } from "chrome-launcher"
import lighthouse, { type Config, desktopConfig, type RunnerResult } from "lighthouse"
import { preview } from "vite"

const APP_ROOT = resolve(import.meta.dir, "..")
const AUDIT_URL = "http://127.0.0.1:4173/sessions"
const CATEGORY_IDS = ["performance", "accessibility", "best-practices", "seo"] as const
const PRESETS = ["mobile", "desktop"] as const
const RUN_COUNT = 3
const THRESHOLD = 100

type CategoryId = (typeof CATEGORY_IDS)[number]
type Preset = (typeof PRESETS)[number]

type AuditScores = {
  readonly accessibility: number
  readonly "best-practices": number
  readonly performance: number
  readonly seo: number
}

type AuditRun = {
  readonly preset: Preset
  readonly run: number
  readonly scores: AuditScores
}

type AuditMeasurement = {
  readonly lighthouseVersion: string
  readonly run: AuditRun
  readonly userAgent: string
}

class LighthouseAuditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LighthouseAuditError"
  }
}

function assertNever(value: never): never {
  throw new LighthouseAuditError(`Unhandled Lighthouse preset: ${value}`)
}

function configForPreset(preset: Preset): Config | undefined {
  switch (preset) {
    case "desktop":
      return desktopConfig
    case "mobile":
      return undefined
    default:
      return assertNever(preset)
  }
}

function readScore(result: RunnerResult, categoryId: CategoryId): number {
  const score = result.lhr.categories[categoryId]?.score
  if (score === null || score === undefined) {
    throw new LighthouseAuditError(`Lighthouse omitted the ${categoryId} score`)
  }
  return Math.round(score * 100)
}

function scoresFrom(result: RunnerResult): AuditScores {
  return {
    accessibility: readScore(result, "accessibility"),
    "best-practices": readScore(result, "best-practices"),
    performance: readScore(result, "performance"),
    seo: readScore(result, "seo"),
  }
}

async function measure(port: number, preset: Preset, run: number): Promise<AuditMeasurement> {
  const result = await lighthouse(AUDIT_URL, { logLevel: "error", port }, configForPreset(preset))
  if (result === undefined) {
    throw new LighthouseAuditError(`Lighthouse returned no ${preset} result for run ${run}`)
  }
  return {
    lighthouseVersion: result.lhr.lighthouseVersion,
    run: { preset, run, scores: scoresFrom(result) },
    userAgent: result.lhr.userAgent,
  }
}

function medianScore(runs: readonly AuditRun[], preset: Preset, categoryId: CategoryId): number {
  const values = runs
    .filter((run) => run.preset === preset)
    .map((run) => run.scores[categoryId])
    .sort((left, right) => left - right)
  const median = values[Math.floor(values.length / 2)]
  if (median === undefined) {
    throw new LighthouseAuditError(`No ${preset} ${categoryId} scores were collected`)
  }
  return median
}

function mediansFor(runs: readonly AuditRun[], preset: Preset): AuditScores {
  return {
    accessibility: medianScore(runs, preset, "accessibility"),
    "best-practices": medianScore(runs, preset, "best-practices"),
    performance: medianScore(runs, preset, "performance"),
    seo: medianScore(runs, preset, "seo"),
  }
}

async function runAudit(): Promise<void> {
  const server = await preview({
    root: APP_ROOT,
    preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  })

  try {
    const chrome = await launch({ chromeFlags: ["--headless=new"], logLevel: "error" })
    try {
      const measurements: AuditMeasurement[] = []
      for (const preset of PRESETS) {
        for (let run = 1; run <= RUN_COUNT; run += 1) {
          await measure(chrome.port, preset, 0)
          measurements.push(await measure(chrome.port, preset, run))
        }
      }

      const firstMeasurement = measurements[0]
      if (firstMeasurement === undefined) {
        throw new LighthouseAuditError("No Lighthouse measurements were collected")
      }
      const runs = measurements.map((measurement) => measurement.run)
      const allPassed = runs.every((run) =>
        CATEGORY_IDS.every((categoryId) => run.scores[categoryId] === THRESHOLD),
      )
      const report = {
        schemaVersion: 1,
        auditedAt: new Date().toISOString(),
        url: AUDIT_URL,
        runner: "Lighthouse Node API over Chrome Stable CDP",
        lighthouseVersion: firstMeasurement.lighthouseVersion,
        userAgent: firstMeasurement.userAgent,
        threshold: THRESHOLD,
        runs,
        medians: {
          mobile: mediansFor(runs, "mobile"),
          desktop: mediansFor(runs, "desktop"),
        },
        allPassed,
      }

      await Bun.write(
        resolve(APP_ROOT, "evidence", "todo-11", "lighthouse-results.json"),
        `${JSON.stringify(report, null, 2)}\n`,
      )
      if (!allPassed) {
        throw new LighthouseAuditError("At least one Lighthouse category scored below 100")
      }
    } finally {
      chrome.kill()
    }
  } finally {
    await server.close()
  }
}

await runAudit()
