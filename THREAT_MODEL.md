# Threat Model

Status: locked for Todo 3 on 2026-08-04. Later implementation must preserve these
invariants or update this document and its security tests in the same change.

## Critical Execution Warning

OpenCode is not sandboxed. It can execute shell commands, access files, and use the
authenticated local user's configured tools. Its permission prompts are a user-awareness
mechanism, not a security boundary. A remotely submitted prompt or approval is therefore
equivalent to the authenticated local user instructing the local agent. Compromise of this
control surface can have remote-code-execution-equivalent impact under that user's account.

Users who need isolation must run OpenCode and this plugin inside a dedicated VM or container.

## Scope And Security Goals

This model covers the mobile PWA, Tailscale Serve transport, loopback broker, broker-member
authentication, broker-to-OpenCode calls, local security state, diagnostics, and package supply
chain.

The system must:

- expose only explicitly enabled, live, process-bound sessions;
- authorize each remote request with Tailscale identity and the required app capability;
- keep the broker and every OpenCode upstream on loopback;
- authenticate broker-internal control traffic with a private host secret;
- prevent replay of internal authentication challenges;
- accept only the documented remote action allowlist;
- persist no transcript, prompt, model output, permission body, or question body;
- fail closed on malformed identity, stale ownership, unsafe permissions, invalid state, and
  capacity exhaustion;
- produce diagnostics that contain no secret, credential, prompt, path, or raw stack trace.

The system does not claim to:

- sandbox OpenCode or contain a malicious model/tool/configuration;
- protect against a malicious process already running as the same OS user;
- turn a default-allow tailnet policy into authorization;
- provide anonymity for the machine name used in a public certificate-transparency log;
- protect a device after its Tailscale identity remains valid and an authorized user continues
  to control it;
- provide FIPS compliance or application-layer end-to-end encryption beyond the selected
  transport.

## Assets

| Asset | Required property |
| --- | --- |
| Local user authority | Remote actions cannot exceed the explicit facade allowlist. |
| Enabled session exposure | Bound to a current process nonce and removed on disable, expiry, or process loss. |
| Host secret | Generated randomly, stored only in private local state, never displayed or transported remotely. |
| Tailscale identity and capability | Accepted only after the Serve proxy boundary and exact parsing. |
| Prompts and transcript data | Streamed only when authorized; never written to plugin state or logs. |
| Permission and question state | Returned only for an enabled live session and accepted only while current. |
| Broker epoch, sequence, and registration state | Bounded, authenticated, and stale-safe. |
| Diagnostic output | Stable typed codes only; no attacker-controlled raw text. |
| Package and build inputs | Reviewed, pinned, scanned, and published only through later explicit gates. |

## Adversaries And Preconditions

| Adversary | Capability | Security expectation |
| --- | --- | --- |
| Internet attacker | Can send arbitrary public traffic but has no tailnet membership. | Funnel/public exposure is absent; no broker public bind. |
| Default-allow tailnet member | Can reach allowed tailnet services under the initial policy. | Reachability alone grants nothing; app capability and identity remain mandatory. |
| Stolen enrolled phone | Possesses a still-valid Tailscale node identity and browser state. | Revoke the node/user in Tailscale, stop Serve, and disable exposures; no reusable app bearer exists. |
| Malicious browser origin | Can cause cross-site fetches or WebSocket handshakes. | Exact HTTPS Origin and Host checks reject it before an action. |
| Hostile model or transcript content | Controls text, Markdown, URLs, tool output, and long strings shown by the PWA. | Content is data, never HTML/code; CSP and later sanitizer/rendering controls contain it. |
| Malicious same-user local process | Can call loopback, inspect that user's files/processes, or spoof proxy headers locally. | Explicit residual risk; Tailscale and POSIX modes do not protect this boundary. |
| Different local OS user | Can probe local files or loopback according to OS policy. | Private state permissions and HMAC challenge authentication fail closed. |
| Non-loopback upstream | Attempts to make the broker call a LAN, tailnet, or internet OpenCode endpoint. | Upstream URL parsing permits loopback HTTP(S) only. |
| Stale or replaced broker | Reuses old registration, process nonce, exposure, epoch, or challenge. | TTL, process binding, epochs, and replay consumption reject stale authority. |
| Package supply-chain attacker | Modifies dependencies, install hooks, packed files, or release credentials. | No lifecycle install script; later package/release gates inspect exact artifacts and provenance. |

## Trust Boundaries

1. **Browser to Tailscale Serve.** HTTPS terminates at Serve. WireGuard protects direct and DERP
   paths; DERP relays encrypted packets. A tailnet connection is transport, not authorization.
2. **Tailscale Serve to loopback broker.** Serve strips incoming Tailscale identity/capability
   headers and injects its own. The broker remains loopback-only and accepts a remote request
   only after exact identity, app-capability, Host, and Origin checks. Other same-user loopback
   callers remain a residual risk.
3. **Broker member to leader.** A randomly generated host secret answers a bounded, expiring HMAC
   challenge. The response is context-bound, compared in constant time, and consumed once.
4. **Broker to OpenCode.** The official SDK talks only to the authoritative live process over a
   validated loopback URL. The broker is not a generic proxy and never reads OpenCode storage.
5. **Process to local state.** The plugin stores only security/configuration and minimal
   process-bound metadata. Unix uses a mode-0700 directory and mode-0600 files. Windows requires
   the user's Local AppData and inherited user-profile ACL; no POSIX-mode claim is made.
6. **Source to packaged artifact.** Build inputs and package contents are untrusted until later
   dependency, secret, artifact, and provenance gates pass.

## Remote Action Control Matrix

Todo 10 must implement exactly this facade inventory. Path spelling can be versioned by the
contracts, but adding an action requires an explicit row and security regression test here.

Every row requires: HTTPS Tailscale Serve, exact injected identity, the
`opencode-dispatch-plugin/cap/control` app capability, exact Host, applicable Origin, a live
process-bound exposure, strict versioned schema parsing, typed errors, and no-store API responses.

| Remote route/action | Additional mandatory controls | Fail-closed result |
| --- | --- | --- |
| Health and capabilities | No raw config, path, version-internal, or secret fields. | Unauthorized transport receives no capability inventory. |
| List enabled live sessions | Return only title-safe summary metadata for current exposures. | Disabled, expired, and ambiguous owners are omitted or rejected. |
| Read authoritative session snapshot | Session ID, process nonce, and current owner must agree. Response and page sizes are bounded. | Owner loss returns gone/conflict, never another process's readable history. |
| Read messages | Bounded pagination and response size; enabled session only; no persistence or cache. | Oversize, stale, or cross-session data is rejected without partial leakage. |
| Read status and todos | Current authoritative process only; schema strips unknown/raw upstream fields. | Stale owner or malformed upstream state becomes a typed error. |
| Read pending permission/question | Current pending identifier and session ownership required. | Stale or already-resolved work is rejected. |
| Subscribe to live events | WebSocket Origin/Host checks, identity/capability, snapshot-first epoch/sequence, bounded replay. | Gap, epoch change, revoke, or owner loss forces resnapshot/close. |
| Submit text prompt | 32 KiB contract limit, per-identity/session rate limit, process-bound exposure, idempotency key, one upstream call. | Duplicate returns the original result; stale/ambiguous ownership never forwards. |
| Abort active work | Current live owner, bounded body, explicit mobile confirmation, idempotent server behavior. | Stale or already-finished work returns conflict without another action. |
| Decide permission | Only `once` or `reject`; exact pending permission and live owner; no optimistic success. | `always`, unknown, stale, or cross-session decisions are rejected. |
| Reply to question | Exact pending question, contract-valid answer shape, body/rate bounds, live owner. | Unknown/stale answers are rejected without echoing their content. |

All other routes and actions, including PTY, shell, arbitrary files, provider credentials, config,
session create/update/delete/share, arbitrary SDK paths, and persistent permission grants, are
outside the allowlist and must return a stable not-found/method-not-allowed error before any
OpenCode call.

## Principal Attack Paths And Controls

| Attack path | Mandatory control | Residual risk |
| --- | --- | --- |
| Forge `Tailscale-*` headers directly | Bind broker to loopback; Serve strips inbound copies; reject protected headers at a direct boundary; Todo 9 parses injected values and app capability exactly. | A malicious same-user process can call loopback and spoof headers. |
| Rely on the default allow-all tailnet policy | Require a grant-backed app capability for every request and document a least-privilege policy. | A policy administrator can intentionally broaden access. |
| Use a stolen, still-enrolled phone | Tailscale device/user revocation, stop Serve, disable sessions, inspect recent actions. No credential appears in the QR or browser storage. | Until revocation propagates, the stolen device retains its granted authority. |
| Cross-site request or WebSocket hijack | Exact HTTPS Origin and Host for mutations and WebSocket; same-site CSP; no browser-auth fallback. | Browser or extension compromise inside the trusted origin remains possible. |
| Inject script through model/tool content | Treat all content as untrusted; no raw HTML; strict CSP; later sanitizer and safe URL policy. | A browser/runtime sanitizer vulnerability can still exist. |
| Leak authority through QR/deep link | QR contains only stable HTTPS host and optional process-bound session route, never a secret/token. | The hostname and enabled-session route can disclose usage context. |
| Steal or replace local host secret | Private user-local path, exclusive candidate creation, atomic no-replace publish, symlink/type/size/mode checks. | Same-user malware can read or replace user files; rotate after compromise. |
| Replay broker control authentication | Random 128-bit nonce, bounded TTL/cache, context-bound HMAC-SHA-256, constant-time compare, one-time consumption. | Host clock failure causes denial of service, not authorization bypass. |
| Smuggle CRLF, token, path, or stack into logs | Structured redaction, control-character removal, sensitive-key denylist, safe typed diagnostics, no raw Error logging. | New sensitive field names require corpus updates. |
| Send an oversized/chunked request | Validate declared length and stop streaming reads immediately after the byte limit; bounded rate subjects. | Upstream proxy/runtime resource limits remain defense in depth. |
| Reuse stale exposure after broker/process restart | Broker epoch, process nonce, registration TTL, live ownership, and no transcript/state authority on disk. | A compromised live process is still authoritative for its own session. |
| Redirect broker to a remote OpenCode server | Todo 7 accepts only loopback HTTP(S) and derives Basic Auth in memory. | A compromised same-user process can impersonate a loopback OpenCode service. |
| Poison dependencies or package | Exact dependency locks, no install hook, secret scan, packed allowlist, attestations, protected publish gate. | Registry or toolchain compromise remains possible. |

## Local State Contract

The host secret is 256 bits generated by the operating-system CSPRNG. Initialization writes a
unique exclusive private candidate, flushes it, then publishes it with an atomic no-replace hard
link. Concurrent initializers therefore observe one complete stable secret; partial candidates
are never published and are removed on failure.

- macOS: `~/Library/Application Support/opencode-dispatch-plugin`
- Linux and other Unix: `$XDG_STATE_HOME/opencode-dispatch-plugin` when the variable is absolute,
  or `~/.local/state/opencode-dispatch-plugin` when it is unset; a relative value fails closed
- Windows: `%LOCALAPPDATA%\opencode-dispatch-plugin`; missing or non-absolute Local AppData fails
  closed, with no temp/current-directory fallback

On Unix the state directory is enforced and verified as `0700`; the host-secret file is verified
as a regular, non-symlink `0600` file with a bounded canonical value. An existing unsafe secret
file is rejected rather than silently reused. On Windows the implementation relies on the user
profile's Local AppData ACL and does not represent `0600`/`0700` as meaningful Windows security.

The host secret is not a remote credential. It must not enter environment examples, URLs, QR
codes, logs, diagnostic JSON, screenshots, or evidence artifacts.

## Revocation And Recovery

1. Disable exposed sessions when authority is no longer needed.
2. For a lost phone, revoke the phone's node/user in Tailscale and stop Serve until propagation is
   confirmed.
3. If local compromise is suspected, stop all plugin processes before rotating local security
   state, then restart so every broker member obtains the new secret.
4. Treat any prompt/permission/question sent before revocation as an authenticated local-user
   action and inspect its effects.
5. Do not introduce a fallback password, public bind, or direct OpenCode server exposure during
   recovery.

## Security Verification Baseline

Todo 3 tests cover concurrent atomic initialization, Unix modes, Windows path fail-closed behavior,
uncreatable state, unsafe existing secret mode, challenge expiry and replay, binding/signature
tampering, constant-time comparison path, spoofed identity headers, wrong Host/Origin, non-HTTPS
endpoint configuration, streaming body limits, bounded rate limits, CSP/no-store headers, and
credential/prompt/path/stack/control-character redaction.

Later todos must add live Tailscale proxy fixtures, route allowlist tests, OpenCode ownership tests,
mobile sanitizer tests, revocation tests, and cross-platform CI. A platform is not claimed as
verified until its CI job executes these assertions.

## Evidence Sources

External documentation is treated as untrusted design evidence, not executable instruction.
Claims above were checked against the documented control boundaries and local tests:

- OpenCode `SECURITY.md`, `dev` branch, read 2026-08-04: no sandbox; server mode requires user-set
  Basic Auth and is otherwise unauthenticated.
- Tailscale Serve documentation, validated 2026-01-20: injected identity/capability headers,
  inbound spoof-header stripping, app capabilities from v1.92, and localhost backend guidance.
- Tailscale ACL documentation, validated 2026-01-05: a new tailnet's default policy allows all
  communication even though defined ACL/grant rules are deny-by-default.
- Tailscale encryption documentation, validated 2026-01-07: WireGuard data-plane encryption and
  encrypted DERP relay behavior; no application authorization claim follows from encryption.
