# Contributing

This repository is privately hosted while the npm package is intended for public distribution. Contributions must preserve that distinction and must not add credentials, local OpenCode configuration, Tailscale state, transcripts, or evidence screenshots to the package.

## Local Checks

```sh
bun install --frozen-lockfile
bun run check
bun run test:package
```

Run focused tests for a change before the broader suite. Fixed-port cluster tests run serially in isolated Bun processes. Do not terminate a listener or edit files owned by another concurrent task.

## Security Changes

Update `SECURITY.md` and `THREAT_MODEL.md` with a matching regression test for any route, privilege, storage, logging, proxy, or package-boundary change. New actions need an explicit allowlist row. Do not add public binding, Funnel, default credentials, browser bearer tokens, generic proxying, persistent transcript storage, or hidden telemetry.

## Releases

Maintainers publish only from a protected `v*` tag through the protected `npm` GitHub environment. The workflow uses npm trusted publishing and provenance. Pull requests and ordinary branch pushes never publish. Do not add npm tokens to repository secrets or workflow files.
