# Tailscale Transport

Remote access requires Tailscale Serve. The plugin never installs Tailscale, signs in, edits a tailnet policy, or starts Serve automatically.

## Manual Prerequisites

1. Install Tailscale from its official distribution channel.
2. Sign in and confirm `tailscale status --json` reports `Running`.
3. Enable MagicDNS and Tailscale HTTPS for the tailnet.
4. Choose a non-sensitive machine name before enabling HTTPS. Tailscale certificate issuance can place that name in public certificate-transparency logs.
5. Add a least-privilege grant for every permitted login.

The grant must limit the source login, `autogroup:self` destination, `tcp:443`, and the exact app capability:

```json
{
  "grants": [
    {
      "src": ["person@example.com"],
      "dst": ["autogroup:self"],
      "ip": ["tcp:443"],
      "app": {
        "opencode-dispatch-plugin/cap/control": [{}]
      }
    }
  ]
}
```

Replace `person@example.com` with an authorized Tailscale login. A default-allow tailnet policy is not sufficient authorization.

## Start And Stop Serve

Review the prerequisites and grant before explicitly starting the private mapping:

```sh
tailscale serve --bg --accept-app-caps=opencode-dispatch-plugin/cap/control 43111
```

The target is the dedicated loopback Serve listener. Do not substitute a public address, enable Funnel, add a password fallback, or proxy directly to OpenCode. To stop exposure:

```sh
tailscale serve off
```

The command's diagnostic probe reads only these commands:

```sh
tailscale version
tailscale status --json
tailscale serve status --json
```

It requires Tailscale 1.92 or newer, a running login, MagicDNS, HTTPS, no Funnel, no foreground mapping, a root HTTPS handler targeting `127.0.0.1:43111`, and forwarding of exactly `opencode-dispatch-plugin/cap/control`.

## Device Revocation

For a lost device, revoke its node or user in Tailscale, run `tailscale serve off`, then disable every exposed session in `/dispatch`. Treat actions completed before revocation as actions authorized under the local user's authority.
