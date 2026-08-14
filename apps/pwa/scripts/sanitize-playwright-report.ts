import { resolve } from "node:path"

const appRoot = resolve(import.meta.dir, "..")
const projectRoot = resolve(appRoot, "..", "..")
const reportPath = resolve(appRoot, "evidence", "todo-11", "playwright-results.json")
const reportFile = Bun.file(reportPath)

function sanitizePaths(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replaceAll(projectRoot, "<repo>")
  }
  if (Array.isArray(value)) {
    return value.map(sanitizePaths)
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, sanitizePaths(nestedValue)]),
    )
  }
  return value
}

if (await reportFile.exists()) {
  const report: unknown = await reportFile.json()
  await Bun.write(reportPath, `${JSON.stringify(sanitizePaths(report), null, 2)}\n`)
}
