# Remote Protocol

Protocol version 1 is a deliberately small HTTPS facade behind Tailscale Serve. It is not a general OpenCode API proxy.

## Transport Requirements

Every API and WebSocket request requires the trusted Serve ingress, exact configured HTTPS Host and Origin, a valid injected Tailscale identity, and exactly the `opencode-dispatch-plugin/cap/control` capability. Direct ingress and spoofed identity headers fail closed.

API responses use `Cache-Control: no-store`. The PWA does not cache API, WebSocket, session, or transcript data.

## Read Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Protocol health and version. |
| `GET` | `/api/v1/capabilities` | Allowlisted capabilities and bounds. |
| `GET` | `/api/v1/sessions` | Enabled live session list. |
| `GET` | `/api/v1/sessions/{sessionId}` | Authoritative session snapshot. |
| `GET` | `/api/v1/sessions/{sessionId}/messages` | Bounded message page. |
| `GET` | `/api/v1/sessions/{sessionId}/status` | Current status. |
| `GET` | `/api/v1/sessions/{sessionId}/todos` | Current todos. |
| `GET` | `/api/v1/sessions/{sessionId}/pending` | Pending permission or question state. |
| `GET` | `/api/v1/events` | Authenticated live-event upgrade. |

Pagination accepts only one `cursor` and one `limit`, with a maximum page size of 100.

## Mutation Envelope

`POST /api/v1/actions` accepts strict JSON action schemas for `prompt`, `abort`, `permission_once`, `permission_reject`, and `question_reply`. Prompts are limited to 32 KiB and require an idempotency key. Permission decisions are only `once` or `reject`.

Each action rechecks the current process-bound session authority after pending-state reads before it calls OpenCode. Unknown routes, methods, fields, stale authority, `always` approvals, oversized bodies, and invalid content types are rejected before an OpenCode call.

## Event Continuity

Events are invalidation signals, not transcript persistence. A client obtains a snapshot before subscribing, tracks broker epoch and monotonically increasing scope sequence, and resnapshots after gaps, epoch changes, reconnects, visibility resumes, or revocation. A revocation closes the affected scope before further event processing.
