# Operations

## Daily Flow

Use `/dispatch` from a live OpenCode session. Confirm **Enable current session** before sharing its credential-free HTTPS link. The remote page lists only enabled, live sessions. Disable the session when finished.

The QR code and copied URL contain no bearer token. They can still reveal the tailnet host and enabled-session route, so handle them as private operational metadata.

## Recovery

The PWA begins from an authoritative snapshot and resnapshots after a gap, epoch change, visibility resume, reconnect, or broker change. It shows reconnecting, offline, and revoked states rather than continuing with hidden stale state.

If `/dispatch` reports a foreign listener, stop the service already using the dispatch port. The plugin does not replace or terminate an unknown listener. If it reports that registration expired, open the session in its original live OpenCode process and retry.

Use **Diagnostics** for bounded state codes. Diagnostics do not include prompts, transcripts, credentials, paths, headers, or stack traces.

## Local State

The plugin stores a host secret and minimal process-bound security state. It does not store transcripts or remote API data.

| Platform | State root |
| --- | --- |
| macOS | `~/Library/Application Support/opencode-dispatch-plugin` |
| Linux and Unix | `$XDG_STATE_HOME/opencode-dispatch-plugin`, or `~/.local/state/opencode-dispatch-plugin` |
| Windows | `%LOCALAPPDATA%\\opencode-dispatch-plugin` |

On Unix, the directory and secret file are verified as private. Unsafe paths, symlinks, malformed data, or weak permissions fail closed. Windows relies on the current user's Local AppData ACL and rejects outside-profile, UNC, and device paths.

## Data Deletion

1. Disable each exposed session in `/dispatch`.
2. Stop Serve with `tailscale serve off`.
3. Stop all OpenCode and plugin processes.
4. Remove the applicable state root above if you want to remove the host secret and local security state.
5. Restart OpenCode before enabling another session.

Deleting the state root does not delete OpenCode sessions or external Tailscale audit data. It does make stale plugin members fail to authenticate until restarted.

## Forbidden Operational Changes

Do not bind the broker to a LAN or public interface. Do not enable Funnel, disable app-capability checks, expose the OpenCode server, copy a host secret into environment variables, URLs, QR codes, or scripts, or treat a direct loopback request as trusted Tailscale ingress.
