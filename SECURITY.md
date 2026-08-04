# Security Policy

## Execution And Support Boundary

OpenCode is not sandboxed. This plugin controls an agent that can use the authenticated local
user's shell, files, network, and configured tools. A remote prompt or approval has the same
authority as that local user instructing OpenCode. Use a VM or container when that authority is
too broad.

This plugin is a least-privilege remote facade, not a security wrapper around arbitrary OpenCode
server access. Raw OpenCode HTTP, PTY, shell, filesystem, provider, configuration, session
create/delete/share, and persistent approval endpoints are not exposed.

Security support covers the current maintained package version and its documented OpenCode range
once release metadata is established. Unsupported versions, modified builds, public tunnels,
non-loopback brokers/upstreams, disabled mandatory controls, and malicious same-user local
processes are outside the guaranteed boundary.

## Reporting A Vulnerability

Use GitHub's private vulnerability reporting or a private Security Advisory for
`thiagojesus/opencode-dispatch-plugin`. Include the affected revision, platform, prerequisites,
minimal safe reproduction, impact, and whether a real secret may have been exposed. Do not place
credentials, transcripts, private paths, or weaponized details in a public issue.

If private reporting is unavailable, contact the repository owner through a private channel before
public disclosure. Do not test destructive payloads against systems you do not own.

## Mandatory Deployment Controls

The supported remote topology is:

1. OpenCode and the broker run under the intended local OS user.
2. The broker listens only on loopback.
3. Every OpenCode upstream is validated as loopback HTTP(S).
4. Tailscale Serve proxies the stable tailnet HTTPS name to the loopback broker.
5. Every remote API and WebSocket request requires exact Serve-injected identity and the
   `opencode-dispatch-plugin/cap/control` app capability.
6. Host and browser Origin match the configured Serve HTTPS origin.
7. Only explicitly enabled, live, process-bound sessions are exposed.
8. Remote mutations use strict versioned schemas, body/rate bounds, and action-specific stale
   checks. Prompt submission also uses an idempotency key.

Tailscale reachability is not sufficient authorization. A new tailnet's default policy allows all
devices to communicate, so configure least-privilege grants and retain the application capability
check. Do not use Funnel or a public tunnel for the default deployment.

Serve identity headers are trustworthy only after the trusted proxy boundary. The backend must
remain loopback-only. Incoming `Tailscale-*` headers on a direct request are attacker input and are
rejected. Tailscale does not protect the broker from a malicious process already running as the
same OS user.

## Local Security State

State is user-local and has no insecure fallback:

| Platform | State root | Protection asserted by this project |
| --- | --- | --- |
| macOS | `~/Library/Application Support/opencode-dispatch-plugin` | Directory `0700`; files `0600`. |
| Linux/Unix | Absolute `$XDG_STATE_HOME/opencode-dispatch-plugin`, or `~/.local/state/opencode-dispatch-plugin` when XDG state is unset | Directory `0700`; files `0600`; a relative XDG root fails closed. |
| Windows | `%LOCALAPPDATA%\opencode-dispatch-plugin` | Inherited user-profile Local AppData ACL; no POSIX-mode claim. |

Missing, relative, symlinked, wrong-type, oversized, malformed, or unsafely permissioned security
state fails closed. Windows does not fall back to a shared temp directory or current working
directory when Local AppData is unavailable.

The host secret is generated with the operating-system CSPRNG. Concurrent initialization uses an
exclusive private candidate and atomic no-replace publication, so all successful processes observe
one complete secret. It authenticates loopback broker members with expiring one-time HMAC-SHA-256
challenges and constant-time signature comparison. It is not a browser or remote credential.

Never put the host secret in:

- environment examples or command-line arguments;
- logs, exception messages, diagnostic payloads, or telemetry;
- URLs, QR codes, cookies, browser storage, or screenshots;
- test snapshots, fixtures, bug reports, or evidence artifacts.

## Data And Logging Rules

The plugin does not persist prompts, transcripts, model/tool output, permission bodies, question
bodies, or raw OpenCode responses. PWA API/session responses are `Cache-Control: no-store`; later
service-worker work must keep all API, WebSocket, session, and transcript data network-only.

Diagnostics use typed, stable codes. Unknown errors become a generic fail-closed diagnostic. Raw
Error objects and stacks must never be serialized. Structured redaction removes credentials,
authorization/capability headers, cookies, prompt/message/content/body fields, project paths,
tokens, control characters, and stacks. Redaction is defense in depth, not permission to log
transcripts.

No hidden telemetry is enabled. Adding telemetry or a logger requires an explicit privacy and
redaction design change.

## Browser Controls

Document responses use a restrictive Content Security Policy: same-origin scripts, styles,
connections, fonts, workers, and manifests; no object/frame embedding; no base override; and no
cross-origin opener/resource sharing. Responses also set HSTS, `nosniff`, frame denial, no-referrer,
and restrictive browser permissions. API responses add no-store/no-cache directives.

Model text, tool output, Markdown, URLs, and filenames are hostile input. Product UI must never
render raw HTML, must sanitize even when HTML is disabled, must reject unsafe URL schemes, and must
use safe external-link attributes. CSP is defense in depth and does not replace safe rendering.

State-changing fetches and WebSocket handshakes require the exact configured HTTPS Origin and Host.
Identity/capability authorization is still required; Origin is not authentication.

## Allowed Remote Actions

The complete allowlist is health/capabilities, enabled-session list, authoritative snapshot and
messages/status/todos/pending actions, live events, text prompt, abort, permission `once` or
`reject`, and question reply. Every action is mapped to controls in `THREAT_MODEL.md`.

Anything else is denied before an OpenCode call. There is no `always` permission path, generic
proxy, arbitrary route/path forwarding, app password/JWT fallback, or client-selected OpenCode
message identifier.

## Device Loss, Revocation, And Secret Rotation

For a lost or stolen phone:

1. revoke its node or user in Tailscale;
2. stop Tailscale Serve until revocation has propagated;
3. disable every exposed session;
4. inspect actions that occurred before revocation as local-user-authorized actions.

The QR/deep link contains no bearer credential, so there is no plugin token to revoke. It can still
reveal the tailnet hostname or session route and must be handled as private operational metadata.

For suspected local compromise, stop all plugin/OpenCode processes before rotating local security
state, then restart all members. A mismatched secret intentionally prevents cluster membership.
Never recover by loosening file permissions, adding a default secret, exposing a public bind, or
bypassing Tailscale identity/capability checks.

Tailscale HTTPS certificates can publish the machine's tailnet DNS name in certificate-transparency
logs. Choose a non-sensitive machine name before enabling HTTPS. This is a privacy consideration,
not a break in WireGuard or TLS encryption.

## Residual Risks

- A malicious same-user local process can read user files, inspect processes, call loopback, and
  spoof local proxy headers. Use a dedicated OS user or VM for stronger separation.
- A still-authorized stolen device retains its granted authority until revocation propagates.
- Compromised OpenCode tools, MCP servers, configuration, models, or dependencies can act with the
  local user's authority.
- Browser/runtime or sanitizer vulnerabilities can bypass content defenses.
- Certificate transparency exposes the selected tailnet machine name.
- Denial of service remains possible through local resource exhaustion, clock failure, or a
  compromised authorized identity; bounded caches and rate limits fail closed rather than bypass.

See `THREAT_MODEL.md` for assets, adversaries, trust boundaries, route controls, attack paths, and
verification coverage.
