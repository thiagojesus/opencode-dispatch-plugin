import { resolve } from "node:path"

const appRoot = resolve(import.meta.dir, "..")
const projectRoot = resolve(appRoot, "..", "..")
const defaultReportPath = resolve(appRoot, "evidence", "todo-11", "playwright-results.json")
const requestedReports = process.argv.slice(2)
const reportPaths =
  requestedReports.length === 0
    ? [defaultReportPath]
    : requestedReports.map((path) => resolve(process.cwd(), path))

function sanitizePaths(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replaceAll(projectRoot, "<repo>")
      .replace(/\/Users\/[^/\\]+/gu, "<home>")
      .replace(/[A-Z]:\\Users\\[^\\]+/giu, "<home>")
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

for (const reportPath of reportPaths) {
  const reportFile = Bun.file(reportPath)
  if (await reportFile.exists()) {
    const report: unknown = await reportFile.json()
    await Bun.write(reportPath, `${JSON.stringify(sanitizePaths(report), null, 2)}\n`)
  }
}
