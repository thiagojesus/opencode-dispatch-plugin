export type OpenCodeCompatibility = {
  readonly message: string
  readonly supported: boolean
}

export function checkOpenCodeCompatibility(version: string): OpenCodeCompatibility {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(version)
  const supported =
    match !== null &&
    match[1] === "1" &&
    (Number(match[2]) > 18 || (match[2] === "18" && Number(match[3]) >= 3))
  return {
    message: supported
      ? `OpenCode ${version} is supported.`
      : `Skipping opencode-dispatch-plugin activation: OpenCode ${version} is unsupported; install OpenCode >=1.18.3 and <2.`,
    supported,
  }
}
