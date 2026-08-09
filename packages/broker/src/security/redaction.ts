const REDACTED = "[REDACTED]"
const UNAVAILABLE = "[UNAVAILABLE]"
const CIRCULAR = "[CIRCULAR]"
const TRUNCATED = "[TRUNCATED]"
const MAX_DEPTH = 6
const MAX_ENTRIES = 50
const MAX_STRING_LENGTH = 256

const SENSITIVE_KEY_FRAGMENTS = [
  "authorization",
  "cookie",
  "password",
  "secret",
  "token",
  "apikey",
  "prompt",
  "message",
  "transcript",
  "content",
  "body",
  "stack",
  "path",
  "cwd",
  "project",
  "capability",
  "capabilities",
  "tailscaleuser",
] as const

export type RedactedValue =
  | null
  | boolean
  | number
  | string
  | readonly RedactedValue[]
  | { readonly [key: string]: RedactedValue }

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/gu, "")
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key)
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))
}

export function sanitizeDiagnosticText(value: string): string {
  const controlsRemoved = Array.from(value, (character) => {
    const codePoint = character.charCodeAt(0)
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159) ? " " : character
  }).join("")
  return controlsRemoved
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/giu, REDACTED)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, REDACTED)
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/gu, REDACTED)
    .replace(/\b(?:api[-_]?key|password|secret|token)\s*[:=]\s*[^\s,;]+/giu, REDACTED)
    .replace(/\b[A-Za-z]:[^\s"'<>]*/gu, "[PATH]")
    .replace(/\\[^\s"'<>]*/gu, "[PATH]")
    .replace(/\/[^\s"'<>]*/gu, "[PATH]")
    .slice(0, MAX_STRING_LENGTH)
}

function redactObject(value: object, depth: number, seen: WeakSet<object>): RedactedValue {
  if (seen.has(value)) {
    return CIRCULAR
  }
  seen.add(value)
  if (value instanceof Error) {
    return { name: sanitizeDiagnosticText(value.name), message: REDACTED, stack: REDACTED }
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ENTRIES).map((entry) => redactValue(entry, depth + 1, seen))
  }
  const entries: Array<readonly [string, RedactedValue]> = []
  for (const key of Object.keys(value).slice(0, MAX_ENTRIES)) {
    const safeKey = sanitizeDiagnosticText(key)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !("value" in descriptor)) {
      entries.push([safeKey, UNAVAILABLE])
      continue
    }
    entries.push([
      safeKey,
      isSensitiveKey(key) ? REDACTED : redactValue(descriptor.value, depth + 1, seen),
    ])
  }
  return Object.fromEntries(entries)
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): RedactedValue {
  if (depth > MAX_DEPTH) {
    return TRUNCATED
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value
  }
  if (typeof value === "string") {
    return sanitizeDiagnosticText(value)
  }
  if (typeof value === "object") {
    return redactObject(value, depth, seen)
  }
  return UNAVAILABLE
}

export function redactStructured(value: unknown): RedactedValue {
  try {
    return redactValue(value, 0, new WeakSet())
  } catch {
    return UNAVAILABLE
  }
}
