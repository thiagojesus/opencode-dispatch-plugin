# OpenCode Dispatch PWA Design System

## 0. Research Log

- Design read: a focused mobile developer command surface for one person away from their desk, with warm editorial trust and compact operational density.
- Model gate: visual engineering ran on `openai/gpt-5.6-sol`; Anthropic models were not used.
- Embedded references: shortlisted `opencode.ai.md`, `linear.app.md`, and `claude.md`; selected `taste-skill.md` + `claude.md` + `layout-skill.md` because Claude's warm ring-and-paper language communicates trust while the layout reference supplies resilient app-shell mechanics.
- Dials: `DESIGN_VARIANCE 3`, `MOTION_INTENSITY 2`, `VISUAL_DENSITY 6`.
- Lazyweb: four queries, 32 results, 12 screens directly viewed. Harvested large thumb targets, bottom-reachable primary actions, explicit connection identity, blocking decision context, and dedicated retry surfaces. Full provenance and observations are in `apps/pwa/evidence/todo-4/research.md`.
- Concept drafts: warm trust-first, dark developer-native, and high-contrast field kit were drafted as text-only packets. Image generation was unavailable, so no Imagen output is claimed or fabricated. The weighted scorecard in `apps/pwa/evidence/todo-4/concept-scorecard.md` selects warm trust-first.
- UI/UX database: retained 44px targets, 8px target spacing, mobile-first reflow, visible focus, reduced motion, and announced errors. Rejected its generic slate/green recommendation and external-font suggestions because they conflict with the locked direction and project constraints.
- Current framework docs: Context7 references `/websites/solidjs`, `/kobaltedev/kobalte`, `/vitejs/vite/v8.0.10`, and `/vite-pwa/docs` establish the Solid/Vite/Kobalte/PWA implementation baseline.
- Skipped lanes: Imagen generation only, because this harness exposes no image-generation tool. Embedded and Lazyweb lanes both ran.

### Provenance And Adaptation

| Idea | Source | Adaptation for this product | Explicitly not copied |
| --- | --- | --- | --- |
| Warm paper and charcoal neutrals | `claude.md` | Rebuilt as a semantic light/dark palette for dense operational UI | Claude assets, exact palette, proprietary fonts, and copy |
| Ring-based depth | `claude.md` | One-pixel warm rings plus one quiet elevated shadow | Marketing-card scale and decorative illustration language |
| One named scroll owner | `layout-skill.md` | Transcript/body owns scroll; status and composer stay outside | Marketing document-scroll patterns |
| Thumb-zone action priority | Lazyweb remote/chat screens | One lower-zone primary action with subordinate adjacent actions | Device-control wheels, brand navigation, and ads |
| Blocking context before a decision | Lazyweb approval screens and Kobalte | Kobalte alert dialog with title, context, safe escape, and separated danger action | Native system-dialog appearance and product copy |
| Dedicated recovery state | Lazyweb offline/error screens | Persistent offline panel with state, consequence, and retry | Raw exception names, duplicate retries, and ambiguous `OK` actions |

## 1. Atmosphere & Identity

OpenCode Dispatch feels like a trusted field notebook for a live technical process: warm, direct, calm under failure, and compact enough to act with one hand. It is not a terminal replica and not a general dashboard. The signature is the **continuity rail**, a structural line that joins icon, plain-language state, consequence, and recovery action so enabled, connected, reconnecting, offline, and revoked are recognizable without color.

The chosen concept is **Warm trust-first control desk**. Warm paper surfaces reduce the cold remoteness of controlling another machine, while charcoal text and disciplined semantic color keep technical state exact. Ring depth makes controls tactile without gradients, glass, or heavy card stacks. UI copy is plain and specific. No decorative telemetry, dots, or fake precision appears.

## 2. Color

### Semantic Palette

These values are the sole color source. Implementation maps them to CSS custom properties using the listed OKLCH values. Hex is documented here only and must not appear in source CSS or TSX.

| Role / token | Light hex | Light OKLCH | Dark hex | Dark OKLCH | Usage |
| --- | --- | --- | --- | --- | --- |
| `--color-canvas` | `#F3F0E8` | `oklch(95.5% 0.012 88)` | `#191714` | `oklch(20.5% 0.010 74)` | App and showcase background |
| `--color-surface-primary` | `#FBF9F4` | `oklch(98.2% 0.009 88)` | `#24211D` | `oklch(26.2% 0.012 72)` | Primary panels and rows |
| `--color-surface-secondary` | `#E8E2D6` | `oklch(90.8% 0.020 82)` | `#302B26` | `oklch(32.0% 0.018 67)` | Grouped controls and tool bodies |
| `--color-surface-elevated` | `#FFFDF8` | `oklch(99.2% 0.008 88)` | `#3A342E` | `oklch(36.8% 0.020 68)` | Dialogs and toasts |
| `--color-surface-inset` | `#DDD5C7` | `oklch(87.1% 0.023 78)` | `#151310` | `oklch(18.2% 0.010 72)` | Code and recessed regions |
| `--color-text-primary` | `#211E1A` | `oklch(24.6% 0.012 68)` | `#F3EEE5` | `oklch(95.3% 0.014 78)` | Main text and icons |
| `--color-text-secondary` | `#5E554B` | `oklch(45.5% 0.020 71)` | `#C4BAAC` | `oklch(78.7% 0.023 73)` | Supporting text and metadata |
| `--color-text-disabled` | `#847C71` | `oklch(59.3% 0.020 72)` | `#92887C` | `oklch(62.4% 0.024 70)` | Disabled labels only |
| `--color-border-subtle` | `#D5CCBE` | `oklch(84.1% 0.022 75)` | `#4B433B` | `oklch(40.8% 0.022 67)` | Passive dividers and rings |
| `--color-border-strong` | `#A99E8E` | `oklch(70.6% 0.028 73)` | `#6B6055` | `oklch(50.7% 0.027 68)` | Inputs and interactive boundaries |
| `--color-action-primary` | `#A74324` | `oklch(50.6% 0.151 40)` | `#E48A65` | `oklch(72.1% 0.132 42)` | Primary action and selected emphasis |
| `--color-action-hover` | `#8D351B` | `oklch(44.4% 0.142 39)` | `#F09A75` | `oklch(76.5% 0.128 43)` | Hover state |
| `--color-action-active` | `#742A16` | `oklch(37.9% 0.124 38)` | `#C97051` | `oklch(63.2% 0.121 41)` | Pressed state |
| `--color-on-action` | `#FFF9F2` | `oklch(98.1% 0.013 68)` | `#2B160E` | `oklch(25.5% 0.046 42)` | Text and icons on primary action |
| `--color-focus-ring` | `#1769C2` | `oklch(54.5% 0.175 255)` | `#82B9F1` | `oklch(77.6% 0.103 250)` | Focus indicator only |
| `--color-status-success` | `#2C6B4C` | `oklch(47.0% 0.092 153)` | `#86C99F` | `oklch(79.4% 0.091 151)` | Connected and complete |
| `--color-status-warning` | `#805406` | `oklch(48.2% 0.108 76)` | `#F0BE69` | `oklch(82.0% 0.111 80)` | Reconnecting and pending |
| `--color-status-danger` | `#A3312B` | `oklch(47.8% 0.156 27)` | `#F1968D` | `oklch(74.9% 0.111 27)` | Error, revoked, destructive |
| `--color-status-info` | `#315F91` | `oklch(48.4% 0.098 252)` | `#91BCE8` | `oklch(78.5% 0.084 249)` | Informational and idle |
| `--color-scrim` | `#211E1A99` | `oklch(24.6% 0.012 68 / 60%)` | `#090806B8` | `oklch(12% 0.008 72 / 72%)` | Modal background isolation |

### Color Rules

- Theme follows `prefers-color-scheme`; no section independently inverts theme.
- Accent is for interactive priority, not decoration.
- Status always includes readable text and a Phosphor icon. A color change alone never carries meaning.
- Focus blue is intentionally the only cool chromatic interruption and is reserved for keyboard focus.
- Primary text targets WCAG AAA where practical; all normal text must meet 4.5:1 and large text or UI boundaries 3:1.
- No raw color value may appear outside token declarations. New roles are added here before implementation.
- No gradients, glass, glows, decorative dots, or transparency-dependent text surfaces.

## 3. Typography

### Font Stacks

- Display: `ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`.
- UI/body: `ui-rounded, "SF Pro Rounded", "Avenir Next", "Segoe UI Variable", system-ui, sans-serif`.
- Code: `"SFMono-Regular", "Cascadia Code", "Liberation Mono", ui-monospace, monospace`.
- No external font, CDN, proprietary font file, Inter, Roboto, Arial-first stack, or copied Claude/OpenCode type asset.

### Scale

| Token | Size | Weight | Line height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| `--font-display` | `clamp(2rem, 7vw, 3rem)` | 500 | 1.08 | `-0.025em` | Showcase title only |
| `--font-h1` | `clamp(1.75rem, 5vw, 2.25rem)` | 500 | 1.15 | `-0.018em` | App/page title |
| `--font-h2` | `1.5rem` | 500 | 1.2 | `-0.012em` | Primitive groups |
| `--font-h3` | `1.25rem` | 600 | 1.3 | `-0.006em` | Card and dialog titles |
| `--font-body-lg` | `1.125rem` | 450 | 1.55 | normal | Lead and primary state copy |
| `--font-body` | `1rem` | 450 | 1.55 | normal | Default UI/body text |
| `--font-body-sm` | `0.875rem` | 500 | 1.5 | normal | Supporting metadata |
| `--font-label` | `0.875rem` | 650 | 1.25 | `0.01em` | Controls and state labels |
| `--font-code` | `0.875rem` | 450 | 1.55 | `-0.01em` | Code and tool output only |

### Typography Rules

- Display and major headings use the editorial stack. Functional UI uses the body stack.
- Code and paths use mono and `overflow-wrap: anywhere`; mono is never used as decorative chrome.
- Body copy never falls below 16px. Supporting metadata may be 14px but cannot carry the only explanation.
- Line length is 35-60 characters on mobile and capped near 68 characters on wider surfaces.
- Controls never truncate safety-critical labels. Non-critical session titles may wrap to two lines before truncation.
- Text must reflow at 200% browser zoom and 320% text zoom without hidden actions or horizontal page scroll.

## 4. Spacing & Layout

### Spacing Tokens

All spacing intent derives from a 4px base. CSS uses these custom properties, not ad hoc visual values.

| Token | Value | Usage |
| --- | --- | --- |
| `--space-1` | `0.25rem` | Icon optical correction |
| `--space-2` | `0.5rem` | Inline icon-label gap, minimum target separation |
| `--space-3` | `0.75rem` | Compact control padding |
| `--space-4` | `1rem` | Mobile gutter and row spacing |
| `--space-5` | `1.25rem` | Comfortable group padding |
| `--space-6` | `1.5rem` | Card and section interior |
| `--space-8` | `2rem` | Group separation |
| `--space-10` | `2.5rem` | Major section separation |
| `--space-12` | `3rem` | Showcase chapter separation |
| `--space-16` | `4rem` | Desktop page breathing room |

### Geometry Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `--size-target` | `2.75rem` | Minimum 44px interactive target |
| `--size-icon-sm` | `1rem` | Inline status icon |
| `--size-icon-md` | `1.25rem` | Standard action icon |
| `--size-icon-lg` | `1.5rem` | Primary state icon |
| `--radius-sm` | `0.5rem` | Small chips and code regions |
| `--radius-md` | `0.75rem` | Buttons and inputs |
| `--radius-lg` | `1rem` | Cards, dialogs, state panels |
| `--radius-round` | `999rem` | Status icon wells only, never generic pills |
| `--content-max` | `75rem` | Showcase content limit |
| `--prose-max` | `68ch` | Readable copy measure |

### Named Layout Primitives And Scroll Ownership

- `showcase-document`: the browser document is the only showcase-page scroll owner.
- `app-shell`: grid rows `auto minmax(0, 1fr) auto`, bounded by `100dvb`; header and composer/action dock remain fixed within the shell until browser or text zoom would hide the workspace, then the bounded shell becomes the single scroll owner so every region remains reachable.
- `shell-body`: the standard app-shell vertical scroll owner; always has `min-block-size: 0`, `min-inline-size: 0`, and `overflow: auto`, and yields overflow ownership to `app-shell` only during the measured zoom reflow.
- `list-detail`: at 768px and wider, session list and transcript can sit side by side; each pane may own vertical scroll only when rendered in the bounded app shell and each owner is named.
- `stack`: vertical rhythm through tokenized `gap`.
- `cluster`: wrapping row for actions; wraps before overflow and keeps at least `--space-2` between touch targets.
- `content-limiter`: centered readable measure with fluid inline gutters.
- `intrinsic-grid`: `repeat(auto-fit, minmax(min(18rem, 100%), 1fr))`; the inner `min()` is load-bearing for narrow containers.

### Responsive Contract

| Width | Behavior |
| --- | --- |
| 0-767px | One readable column, 16px gutter, lower-zone primary actions, no primary horizontal scroll |
| 768-1023px | Two-column primitive comparisons where content remains readable; app shell may use list-detail |
| 1024px and wider | Content capped at 1200px; state matrix can expand but touch targets and type do not shrink |

- Test viewports are exactly 375px, 768px, and 1280px in both light and dark.
- Logical properties are required. Layout must remain coherent for RTL-like stress content.
- Long URLs, paths, and unbroken tokens use `overflow-wrap: anywhere` and `min-inline-size: 0`.
- Safe-area insets protect top chrome and bottom actions on installed/mobile browsers.
- No fixed-width content frame, `100vh`, layout animation, or nested unnamed scrollbar.

## 5. Components

Every primitive is implemented as live semantic DOM. Showcase fixtures are clearly examples, never a raster mock or product screen.

### Action Button And Icon Button

- **Structure**: Kobalte `Button` with label and optional Phosphor icon; icon-only buttons require an accessible name.
- **Variants**: primary, secondary, ghost, danger; icon-only only for universally recognizable auxiliary actions.
- **Spacing**: `--space-2` through `--space-4`; minimum block and inline target `--size-target`.
- **States**: default, hover, active, focus-visible, disabled, loading.
- **Accessibility**: semantic disabled/busy state, label never supplied by placeholder text, 44px minimum.
- **Motion**: fast opacity/transform feedback only; none under reduced motion.

### App Shell

- **Structure**: landmark header, continuity rail, `main.shell-body`, and action/composer dock. Repeated previews use `div.shell-body` so the showcase document retains exactly one `main` landmark.
- **Variants**: phone single-column, tablet/desktop list-detail.
- **States**: normal, loading snapshot, offline, revoked.
- **Accessibility**: skip link, one `main`, logical heading order, fixed regions never obscure focus.
- **Layout**: `scroll-body-shell`; only `shell-body` scrolls.

### Continuity Rail

- **Structure**: status icon well, vertical/horizontal rail, state heading, consequence copy, optional recovery action.
- **Variants**: enabled, connected, reconnecting, offline, revoked.
- **States**: static state variants plus focus/hover/active for recovery action.
- **Accessibility**: `role="status"` for non-urgent change, `role="alert"` for revoked/error; text and icon accompany color.
- **Motion**: opacity change for state replacement; no pulse.

### Session Row

- **Structure**: semantic button or link, title, process/location context, status icon and label, optional pending-action count expressed as text.
- **Variants**: idle, busy, waiting, offline, selected, disabled.
- **States**: default, hover, active, focus-visible, selected, disabled, skeleton.
- **Accessibility**: selected state is semantic; title may wrap to two lines; no color-only status.
- **Layout**: cluster inside a minimum-size row; status remains visible when title grows.

### Transcript Part

- **Structure**: article with visible author/type label, content region, optional timestamp-free state annotation.
- **Variants**: user prompt, assistant text, reasoning summary, system notice, error.
- **States**: default, streaming/busy, complete, error, long/unbroken content.
- **Accessibility**: real paragraphs/lists/code; streamed updates use a deliberate live-region boundary and do not repeatedly steal focus.
- **Layout**: content limiter with overflow-safe code blocks; main transcript owns scroll in product composition.

### Tool Card

- **Structure**: disclosure trigger, tool name, plain-language state, summary, expandable output region.
- **Variants**: queued, running, complete, failed.
- **States**: collapsed, expanded, focus-visible, disabled, loading, error, long output.
- **Accessibility**: disclosure semantics announce expanded state; state includes icon and text; output is selectable and wrap-safe.
- **Motion**: no layout animation. State icon/text crossfade only where supported.

### Composer

- **Structure**: visible label, multiline text area, helper/status text, send button, optional abort action outside the typing flow.
- **Variants**: empty, ready, sending, disabled/offline, error.
- **States**: default, hover (actions), focus-within, active, disabled, loading, error, long/unbroken draft.
- **Accessibility**: label is never placeholder-only; submit state is announced; focus remains predictable after send failure.
- **Layout**: action dock outside transcript scroll owner; safe-area padded; actions wrap before overflow.

### Question Card

- **Structure**: heading, context, fieldset/legend, choices or labeled text field, submit action.
- **Variants**: single choice, multiple choice, free response.
- **States**: unanswered, focused, answered, submitting, disabled, error.
- **Accessibility**: Kobalte-compatible native controls, keyboard selection, explicit legend, inline announced error.

### Permission Card

- **Structure**: permission title, requested capability, exact scope/context, approve-once action, reject action.
- **Variants**: pending, approved once, rejected, expired.
- **States**: default, hover, active, focus-visible, submitting, disabled, error.
- **Accessibility**: action labels are explicit; danger is separated; `always` is never offered; color is secondary to text/icon.

### Confirmation Dialog

- **Structure**: Kobalte `AlertDialog` trigger, portal, scrim, title, consequence description, cancel, confirm.
- **Variants**: abort and revoke/destructive confirmation.
- **States**: closed, opening, open, focus-visible, submitting, error.
- **Accessibility**: focus trap, initial focus on safe cancel, Escape closes when safe, focus returns to trigger, background inert.
- **Motion**: opacity and scale only using standard/dialog timing; instant under reduced motion.

### Toast

- **Structure**: Kobalte `Toast.Region`, `Toast.List`, title, description, close action.
- **Variants**: info, success, warning, error.
- **States**: entering, visible, focus-visible, paused, dismissed.
- **Accessibility**: polite live region for routine outcomes, assertive only for actionable failure; never steals focus; critical recovery remains inline instead.
- **Update notice**: a waiting service worker uses a persistent informational toast with an explicit update action and a later dismissal; activation reloads only after user choice.

### Skeleton

- **Structure**: shape-matched neutral blocks with screen-reader loading text.
- **Variants**: session row, transcript part, tool card.
- **States**: loading and resolved.
- **Accessibility**: `aria-busy` on owner, hidden decorative blocks, no essential shimmer.
- **Motion**: static tonal blocks; optional opacity breathing is omitted at motion dial 2.

### Empty, Error, And Offline State Panel

- **Structure**: Phosphor icon, clear heading, cause/consequence copy, one primary recovery action, optional secondary help.
- **Variants**: no enabled sessions, empty transcript, generic error, offline, revoked.
- **States**: default, retry focus/hover/active, retry loading, repeated failure.
- **Accessibility**: error/offline changes are announced once; action remains keyboard and touch reachable; no raw stack or exception text.

### Showcase Coverage Matrix

The primitive showcase must expose every named variant plus representative interactive states. Hover and active are verified by browser interaction, focus by keyboard, disabled/loading/error via visible fixtures. Light and dark, 375/768/1280, long/unbroken content, empty, offline, reduced motion, and 200%/320% zoom are mandatory coverage dimensions.

## 6. Motion & Interaction

### Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--duration-fast` | `120ms` | Press, hover, focus-adjacent feedback |
| `--duration-standard` | `180ms` | Disclosure and state replacement |
| `--duration-dialog` | `220ms` | Dialog enter/exit |
| `--ease-standard` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | All supported transitions |

### Rules

- Motion intensity 2 means no automatic entrance choreography, pulse, shimmer, marquee, parallax, or decorative animation.
- Motion communicates only press feedback, focus context, disclosure, or modal/state change.
- Animate `transform`, `opacity`, and `filter` only. Never animate layout properties.
- Active feedback may translate or scale within the control's own bounds and cannot move surrounding layout.
- `prefers-reduced-motion: reduce` makes transitions effectively instant and removes transform feedback.
- Keyboard order follows DOM/visual order. Focus is always visible and never clipped.
- Touch actions use `touch-action: manipulation`; adjacent targets keep at least 8px separation.

## 7. Depth & Surface

### Strategy

Use **mixed tonal shift plus warm rings**. The canvas, primary surface, secondary surface, elevated surface, and inset surface establish most hierarchy. Rings make interactive boundaries legible. One soft elevated shadow is reserved for dialogs and toasts.

| Token | Value | Usage |
| --- | --- | --- |
| `--ring-subtle` | `0 0 0 1px var(--color-border-subtle)` | Resting cards and grouped controls |
| `--ring-strong` | `0 0 0 1px var(--color-border-strong)` | Inputs and hover emphasis |
| `--shadow-elevated` | `0 1rem 2.5rem color-mix(in oklch, var(--color-text-primary) 14%, transparent)` | Dialog and toast only |
| `--shadow-focus` | `0 0 0 3px var(--color-focus-ring)` | Focus-visible outer ring |

### Surface Rules

- No glass, backdrop blur, gradient, glow, decorative noise, dotted field, or floating-card atmosphere.
- Cards exist only where containment conveys state or interaction; lists otherwise use spacing and sparse dividers.
- Buttons use `--radius-md`, cards/dialogs use `--radius-lg`, status icon wells alone may be round.
- Scrim must sufficiently isolate the foreground in both themes.
- No surface depends on translucency for text contrast.

## 8. Accessibility Constraints & Accepted Debt

### Inclusive Personas And Stress Contexts

| Persona/context | Required outcome |
| --- | --- |
| One-handed developer away from desk | Primary action reachable, no precision tapping, status legible at a glance |
| Unstable cellular or resumed browser | Reconnecting/offline/revoked are distinct and recovery preserves context |
| Fatigued or distracted user | Decisions state consequence, destructive actions confirm, no competing primaries |
| Keyboard-only user | Full operation, logical order, visible unclipped focus, Escape and return-focus behavior |
| Screen-reader user | Landmarks, headings, labels, state announcements, and decision context are complete |
| Low vision and zoom user | 200% browser zoom and 320% text zoom reflow without hidden actions or primary horizontal scroll |
| Color-vision deficiency or high contrast | Icon/text/shape supplement color; boundaries remain visible in both themes |
| Reduced-motion user | No essential information depends on animation; transitions become instant |

### WCAG 2.2 AA Constraints

- Normal text contrast at least 4.5:1; large text and meaningful UI graphics at least 3:1.
- Every pointer target is at least 44 by 44 CSS pixels with at least 8px target separation where controls are adjacent.
- Full keyboard operability with DOM order matching reading order.
- Focus-visible indicator uses the dedicated focus token, is never removed, and is not hidden by overflow.
- Semantic HTML first. Kobalte supplies focus/keyboard behavior for composite dialogs/toasts; raw clickable containers are forbidden.
- Inputs have persistent labels and errors are adjacent plus announced.
- Status and validation never rely on color alone.
- Zoom is never disabled in viewport metadata.
- Long, RTL-like, and unbroken content cannot cause primary horizontal page scroll.
- Safe areas, reduced motion, light/dark system preference, forced colors, and high contrast are respected.
- Toasts do not steal focus. Dialogs trap and restore focus. Route/page entry starts at a meaningful heading or main region.
- No unresolved accessibility debt may be shipped from the primitive showcase.

### Accepted Debt

| Item | Location | Affected users | Why accepted | Owner / exit condition |
| --- | --- | --- | --- | --- |
| None | None | None | No design or accessibility debt is accepted for Todo 4 | Any discovered issue blocks showcase approval until fixed |
