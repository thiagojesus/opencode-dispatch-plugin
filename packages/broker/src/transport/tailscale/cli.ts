import type { TailscaleCommandRunner } from "./types.ts"

const DEFAULT_TIMEOUT_MS = 5_000
const MAX_OUTPUT_BYTES = 1024 * 1024

export type TailscaleCliRunnerConfig = {
  readonly executable?: string
  readonly timeoutMs?: number
}

export function createTailscaleCliRunner(
  config: TailscaleCliRunnerConfig = {},
): TailscaleCommandRunner {
  const executable = config.executable ?? "tailscale"
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return async (command) => {
    try {
      const subprocess = Bun.spawn([executable, ...command], {
        env: { ...process.env, TAILSCALE_BE_CLI: "1" },
        killSignal: "SIGKILL",
        maxBuffer: MAX_OUTPUT_BYTES,
        stderr: "pipe",
        stdout: "pipe",
        timeout: timeoutMs,
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(subprocess.stdout).text(),
        new Response(subprocess.stderr).text(),
        subprocess.exited,
      ])
      return { kind: "completed", exitCode, stderr, stdout }
    } catch {
      return { kind: "unavailable" }
    }
  }
}
