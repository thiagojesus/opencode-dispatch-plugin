export class FixtureConfigurationError extends Error {
  override readonly name = "FixtureConfigurationError"

  constructor(readonly field: string) {
    super(`Fixture configuration is invalid for ${field}.`)
  }
}

export class FixtureAssetMissingError extends Error {
  override readonly name = "FixtureAssetMissingError"

  constructor() {
    super("The production fixture asset is unavailable.")
  }
}

export class FixtureStartupError extends Error {
  override readonly name = "FixtureStartupError"

  constructor(readonly memberId: string) {
    super(`Fixture process ${memberId} did not publish a valid ready message.`)
  }
}

export class FixtureProcessExitedError extends Error {
  override readonly name = "FixtureProcessExitedError"

  constructor(
    readonly memberId: string,
    readonly exitCode: number | null,
  ) {
    super(`Fixture process ${memberId} is no longer available.`)
  }
}
