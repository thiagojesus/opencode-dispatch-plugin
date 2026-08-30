# Troubleshooting

| `/dispatch` result | Safe next step |
| --- | --- |
| `cli_missing` | Install Tailscale manually, then retry. |
| `version_unsupported` | Update Tailscale to 1.92 or newer. |
| `logged_out` | Sign in to Tailscale manually, then retry. |
| `magicdns_unavailable` | Enable MagicDNS for the tailnet. |
| `https_unavailable` | Review machine naming and enable Tailscale HTTPS manually. |
| `serve_off` | Review the grant and start the documented private Serve mapping. |
| `serve_misconfigured` | Stop Serve, inspect `tailscale serve status --json`, then configure the exact loopback target and capability. |
| `foreign_listener` | Stop the other service using the dispatch port. Do not kill it from the plugin. |
| `registration_expired` | Reopen the session in the original live OpenCode process and retry. |
| `session_missing` | Open a live OpenCode session before enabling access. |

## Safe Diagnostic Commands

```sh
tailscale version
tailscale status --json
tailscale serve status --json
```

Do not paste their complete output into a public issue. It can include device and tailnet metadata. Report the typed diagnostic code, Tailscale version, OpenCode version, operating system, and a redacted reproduction instead.

## Remote Page Does Not Load

Confirm that the session remains enabled and its original OpenCode process is still live. Confirm that the remote device is logged into the intended tailnet and has the exact app capability grant. A direct browser request to the loopback broker is expected to fail.

## Revoked Or Offline State

Revoked is terminal for that session route. Reopen `/dispatch` locally and intentionally enable a current live session after reviewing access. For offline or reconnecting states, restore connectivity and allow the PWA to obtain a fresh snapshot. Do not refresh by exposing a direct broker address or removing Tailscale controls.
