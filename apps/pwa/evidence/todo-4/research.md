# Todo 4 Design Research Evidence

Date: 2026-08-04
Model gate: `openai/gpt-5.6-sol`

## Embedded references

- Shortlist: `opencode.ai.md`, `linear.app.md`, `claude.md`.
- Locked stack: `taste-skill.md` + `claude.md` + `layout-skill.md`.
- Design dials: variance 3, motion 2, density 6.
- Take from Claude: warm-neutral trust, serif-led editorial hierarchy, quiet ring depth, and restrained terracotta emphasis.
- Leave behind: copied assets, proprietary fonts, brand copy, oversized marketing pacing, and section-level theme inversion.
- Adaptation: use system-local Iowan/Avenir/Segoe stacks, compact app density, explicit state labels, and one named scroll owner per shell region.

## Lazyweb research

The anonymous read-only token was held only for the command lifetime to respect the task's file-ownership boundary. No token or signed image URL is stored here.

Queries, mobile platform, eight results each:

1. `mobile developer tool live session list remote control`
2. `mobile AI chat control composer tool result`
3. `mobile approval inbox permission confirmation request`
4. `mobile reconnect offline error recovery state`

Result count: 32. Directly viewed screen count: 12.

Viewed screen provenance:

| Lane | Shipped product | Source screenshot | What was inspected |
| --- | --- | --- | --- |
| Remote control | chromecaster | `2025_05_27_23-26-51_A3AF6903.png` | Large central control, separated utility actions, persistent bottom navigation |
| Remote control | fire-tv | `2025_06_13_04-21-19_EEC21046.png` | Device identity at top, high-contrast dark surface, thumb-scale directional controls |
| Remote control | youtube | `t_ - 10145.PNG` | Connection status in the title region, one dominant control, sparse secondary actions |
| AI control | character_AI | `t_ - 10514.PNG` | Transcript ownership, docked composer, visible assistant disclosure, send affordance |
| AI control | pages | `t_ - 10581.PNG` | Bottom sheet composition, task explanation before action, clear escape route |
| AI control | chatgpt | `t_ - 10714.PNG` | Bottom-reachable composer, suggestion row, compact top chrome, keyboard coexistence |
| Approval | venmo | `2024-10-06-16-08-04-.png` | Blocking modal, reason before options, background inertness, separated choices |
| Approval | airbnb | `t_ - 10225.PNG` | Permission prompt over a first-party explanation, clear cancel/settings split |
| Approval | cvs | `RPReplay_Final1726493524 copy.PNG` | Plain-language identity check, primary action anchored near the bottom |
| Recovery | donotpay | `com.donotpay.dnpapp.png` | Modal connection error with a single acknowledgement |
| Recovery | falou | `t_ - 11445.PNG` | Dedicated no-internet state with one prominent retry action |
| Recovery | discovery | `IMG_4238.PNG` | Error detail plus retry, and the failure mode of leaking implementation text |

The first query returned remote-control screens rather than session lists. Those results still provided relevant one-handed control grammar, but they are not represented as session-list evidence.

## Layout grammar harvested

- Put authoritative connection identity and state in the top reading path.
- Reserve the lower thumb zone for the current primary action, never a competing set of equal actions.
- Let transcript/content own vertical scroll; keep shell status and composer outside that scroll owner.
- Present approval context before choices and trap focus while the decision surface is open.
- Use state words plus an icon or shape. Never rely on a colored dot alone.
- Make recovery a stable surface with one retry and preserved context, not a transient toast.
- Keep destructive and permission decisions spatially separated from routine actions.
- Avoid raw exception names, duplicate retry controls, ad-driven clutter, and dense icon-only navigation.

## UI/UX database sanity check

- The generated generic recommendation (`Soft UI Evolution`, dark slate, green CTA) was rejected because it conflicts with the locked warm editorial reference and would drift toward a generic developer dashboard.
- Retained guidance: 44px targets, 8px target spacing, mobile-first layout, visible focus, reduced motion, non-color state cues, and announced errors.
- External font recommendations were rejected because the task forbids external fonts and CDNs.

## Tool availability

- Imagen/image-generation tooling is not present in this harness.
- No concept images are claimed or fabricated.
- Three text-only concept packets and their weighted scorecard are recorded in `concept-scorecard.md`.
- The temporary Lazyweb image directory is outside the repository and will be removed after design synthesis.
