# Installation

## Supported Versions

The package supports OpenCode `>=1.18.3 <2`. A version outside that range is skipped before plugin activation. Do not bypass that check or patch generated plugin configuration by hand.

## Install In An Isolated Config

For a first run, point OpenCode at a disposable configuration directory. This keeps existing user configuration out of the test path.

```sh
export OPENCODE_CONFIG_DIR="$(mktemp -d)"
opencode plugin -g opencode-dispatch-plugin
```

Restart OpenCode, open a live session, then invoke `/dispatch`. The plugin adds target-specific server and TUI entries through OpenCode's installer. It does not require a package lifecycle script or a local server address in configuration.

For normal use, omit `OPENCODE_CONFIG_DIR` and run the same installer command. The installer changes OpenCode plugin configuration, so review the resulting diff before using it on a valuable configuration.

## First Session

1. Start OpenCode locally.
2. Open the session you want to expose.
3. Run `/dispatch`.
4. Select **Enable current session** and confirm.
5. Complete the manual Tailscale setup shown by the command.
6. Return to `/dispatch` and use **Show QR** or **Copy URL** only after Tailscale reports ready.

An enabled route remains available only while the original OpenCode process is live. Disabling the session, process exit, registration expiry, or device revocation removes remote access.

## Uninstall

Use OpenCode's plugin management command for the installed package, then restart OpenCode. Disable all exposed sessions and stop Serve first:

```sh
tailscale serve off
```

The plugin stores local security state in the platform user state directory. Remove that directory only after all plugin processes are stopped. Removing it rotates the host secret and makes any remaining broker members unable to join until restarted. See [data deletion](OPERATIONS.md#data-deletion).
