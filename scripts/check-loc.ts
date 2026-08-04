import { stat } from "node:fs/promises"
import { basename, extname, relative, resolve, sep } from "node:path"

const MAX_PURE_LOC = 250
const DEFAULT_INPUTS = ["apps", "packages", "scripts", "tests"] as const
const TYPESCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([".cts", ".mts", ".ts", ".tsx"])
const EXCLUDED_DIRECTORIES: ReadonlySet<string> = new Set([
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
])
const TYPESCRIPT_FILES = new Bun.Glob("**/*.{cts,mts,ts,tsx}")

type Quote = '"' | "'" | "`"

type LexicalState = {
  readonly inBlockComment: boolean
  readonly quote: Quote | null
}

type LineScan = {
  readonly hasCode: boolean
  readonly state: LexicalState
}

function isTypeScriptModule(filePath: string): boolean {
  return TYPESCRIPT_EXTENSIONS.has(extname(filePath))
}

function isGeneratedPath(filePath: string): boolean {
  return filePath.split(sep).some((segment) => EXCLUDED_DIRECTORIES.has(segment))
}

async function collectTypeScriptModules(inputs: readonly string[]): Promise<readonly string[]> {
  const modules = new Set<string>()

  for (const input of inputs) {
    const absoluteInput = resolve(input)
    const inputStat = await stat(absoluteInput)

    if (inputStat.isFile()) {
      if (isTypeScriptModule(absoluteInput) && !isGeneratedPath(absoluteInput)) {
        modules.add(absoluteInput)
      }
      continue
    }

    if (inputStat.isDirectory()) {
      for await (const modulePath of TYPESCRIPT_FILES.scan({
        cwd: absoluteInput,
        onlyFiles: true,
      })) {
        const absoluteModulePath = resolve(absoluteInput, modulePath)
        if (!isGeneratedPath(absoluteModulePath)) {
          modules.add(absoluteModulePath)
        }
      }
    }
  }

  return [...modules].sort()
}

function isQuote(character: string): character is Quote {
  return character === '"' || character === "'" || character === "`"
}

function scanLine(line: string, previousState: LexicalState): LineScan {
  let inBlockComment = previousState.inBlockComment
  let quote = previousState.quote
  let escaped = false
  let hasCode = quote !== null

  for (let index = 0; index < line.length; index += 1) {
    const character = line.charAt(index)
    const nextCharacter = line.charAt(index + 1)

    if (inBlockComment) {
      if (character === "*" && nextCharacter === "/") {
        inBlockComment = false
        index += 1
      }
      continue
    }

    if (quote !== null) {
      hasCode = true
      if (escaped) {
        escaped = false
      } else if (character === "\\") {
        escaped = true
      } else if (character === quote) {
        quote = null
      }
      continue
    }

    if (character === "/" && nextCharacter === "/") {
      break
    }
    if (character === "/" && nextCharacter === "*") {
      inBlockComment = true
      index += 1
      continue
    }
    if (isQuote(character)) {
      quote = character
      hasCode = true
      continue
    }
    if (character.trim().length > 0) {
      hasCode = true
    }
  }

  return { hasCode, state: { inBlockComment, quote } }
}

function countPureLines(source: string): number {
  let state: LexicalState = { inBlockComment: false, quote: null }
  let pureLineCount = 0

  for (const line of source.split(/\r?\n/u)) {
    const result = scanLine(line, state)
    state = result.state
    if (result.hasCode) {
      pureLineCount += 1
    }
  }

  return pureLineCount
}

function displayPath(filePath: string): string {
  const relativePath = relative(process.cwd(), filePath)
  if (relativePath.startsWith(`..${sep}`)) {
    return basename(filePath)
  }
  return relativePath
}

const inputs = Bun.argv.length > 2 ? Bun.argv.slice(2) : DEFAULT_INPUTS
const modules = await collectTypeScriptModules(inputs)
const violations: string[] = []

for (const modulePath of modules) {
  const source = await Bun.file(modulePath).text()
  const pureLineCount = countPureLines(source)

  if (pureLineCount > MAX_PURE_LOC) {
    violations.push(
      `${displayPath(modulePath)}: ${pureLineCount} pure LOC exceeds limit ${MAX_PURE_LOC}`,
    )
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation)
  }
  process.exit(1)
}

const moduleLabel = modules.length === 1 ? "module" : "modules"
console.log(
  `Checked ${modules.length} TypeScript ${moduleLabel}; all are within ${MAX_PURE_LOC} pure LOC.`,
)
