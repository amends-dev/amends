# Testing

All tests import their test APIs from `@effect/vitest`. The root dependency uses
the same catalog release as Effect. Vitest runs on Bun so SQLite and host tests
exercise the application's runtime. Oxlint rejects imports from `bun:test` and
direct test API imports from `vitest`.

## Commands

Run these commands from the repository root:

```sh
bun run test
bun run test packages/core/test
bun run test --project backend
bun run test --project postgresql
bun run test --project @amends/ui
bun run test --project @amends/design-system
bun run test --project @amends/frontend
bun run test --project @amends/web
bun run test --watch packages/core/test
bun run check
```

The root configuration discovers only application tests. The `backend` project
covers shared packages, SQLite, and the local host. PostgreSQL has its own project
and global setup. The UI, design-system, frontend, and web projects use their Solid/Vite transforms and
Happy DOM environments. Vendored repositories are outside test discovery.

The [design-system workshop](../apps/design-system/README.md) has component tests plus portable
tests that execute the same Storybook render/play scenarios. Test declarations use `@effect/vitest`;
browser-instrumented play functions use `storybook/test`. The Storybook Vitest addon is not installed
because its current peer range excludes our Vitest 5 runner. The public Solid `/next` preview factory
allows the portable scenarios to run in the existing suite.

The new [frontend workshop](../apps/frontend/README.md) uses the same portable-story
approach to verify its Solid rendering and interaction setup. Build it independently
with `bun run --filter @amends/frontend build`; no existing UI is imported into this package.
Its [color foundation](../apps/frontend/src/foundations/color/README.md) tests eight reading
pairings and six enabled action pairings with Color.js. Storybook specimens support browser
checks of the actual CSS variables, theme switching, nested scopes, and contrast. Action-color
play checks verify computed text/fill/surface colors and alpha, enabled contrast, and disabled
semantics; they need a browser and are excluded from Happy DOM. Visually review disabled colors
on canvas and panel, narrow layouts, and enlarged text separately.
Control-color tests add twelve plain border pairings and eight overlay/surface combinations.
The development-only blend helper has endpoint and unsupported-input tests. Browser play
checks verify actual colors and alpha, compare text/border contrast after compositing, and
cross-check the blend against an sRGB canvas render. Review all Controls stories, including
nested themes, theme switching, and narrow/enlarged layouts; these browser checks do not run
under Happy DOM.
Status tests cover text/indicator pairs on canvas, panel, and their own composited soft
backgrounds, plus focus contrast on the tints. The full token tree is checked for sRGB gamut,
opacity, matching theme keys, and validation/danger aliases. Decorative seams are deliberately
excluded from control-boundary contrast assertions. Status story play checks verify rendered
values and blending; Portal Themes checks nested status variables through Tooltip's portal.
Review visible labels/shapes and forced colors as well as contrast, and rerun existing Button,
Input, Select, and Shell browser specimens after changing the shared color contract.
The [typography stories](../apps/frontend/src/foundations/typography/README.md) run browser
play checks for real font loading, computed metrics, and wrapping. They are intentionally
excluded from Happy DOM portable-story tests because that environment cannot verify font
rendering. Review their Interactions and Accessibility panels in Storybook, including the
narrow and enlarged-text scenarios.
The [Text primitive](../apps/frontend/src/primitives/text/README.md) has DOM tests for
native semantics, forwarding, refs, class merging, and reactive updates, plus compile-time
usage checks. Its Reactive Props story also runs through the portable-story suite; actual
colors, typography, margins, and wrapping are verified in the browser.
Semantic Text stories check actual status colors and 4.5:1 contrast on plain and matching
soft backgrounds, including nested inheritance. DOM/type tests verify semantic tone changes
preserve the element and do not add live-region semantics.
The [Button primitive](../apps/frontend/src/primitives/button/README.md) has DOM and type checks
for native semantics, prop/ref/event forwarding, disabled activation, explicit form submission,
preventing default, and reactive updates, including variant changes that preserve focus and the element. Activation
and Forms for all three variants, plus Reactive Props and the three pending-recovery stories, run as portable
stories. Real browser checks cover native Enter/Space/Tab input, actual state colors and outlines,
inherited fieldset disabling, narrow/enlarged labels, coarse pointers, and forced colors. Pending
checks cover repeat-activation blocking, submit/reset cancellation and recovery, caller ARIA
restoration, retained focus/layout, and reduced motion. The consuming form also guards direct submissions.
Button Comparison additionally checks all three variants' computed fills, text, borders, and
composited contrast against the current palette. Run it
after shared color changes to catch stale dependent styles in the development server, even
when the standalone color stories and production build pass.
The same comparison checks cover danger variants, disabled fieldsets, and pending specimens.
Danger recovery stories run as portable tests for all three variants; IconButton has its own
danger activation story. Contrast tests cover the dedicated `action.danger` fill/tint/border
pairings, and foundation stories display the tokens separately from the real Button consumers.
The [Input primitive](../apps/frontend/src/primitives/input/README.md) has native-prop, ref/event,
reactivity, selection, validity, form-data, reset-default, and type checks. Editing and Forms
run as portable stories. Browser Comparison verifies actual themed colors, placeholders,
radius, and inherited-disabled form-data exclusion (Happy DOM does not model that exclusion).
Use Playwright for native typing/Enter/Tab, invalid focus, read-only selection, forced colors,
long values, 320px layouts, and enlarged text. Radius specimens include the 10px medium token;
Controls specimens include the invalid-border role independently of Input.
The [Field composition](../apps/frontend/src/compositions/field/README.md) has DOM/type tests for
unique identities, native label/description associations, external-description deduplication,
wrapper props, required/disabled/error changes, and control identity/focus/selection retention.
Its reactive and form stories run as portable tests. Browser review verifies real label clicks,
validation focus, native submission, disabled tab stops, narrow/enlarged message wrapping,
forced colors, and error-text contrast. Four additional contrast tests cover `text.invalid`.
The [Radio primitive](../apps/frontend/src/primitives/radio/README.md) has DOM/type tests for
forwarding, reactive checked/disabled props, native grouping, form values/reset, and fieldset
disabling. Interaction and Forms run as portable stories. Use Playwright for native Tab/arrows/
Space, label activation, state colors, forced colors, and narrow/enlarged labels.
The [RadioGroup composition](../apps/frontend/src/compositions/radio-group/README.md) tests
controlled callbacks, group isolation, associations, refreshed-option identity/focus, removed
or disabled selections, native attributes, and duplicate values. Plain/card interaction and
form stories plus refreshed options run as portable tests. Browser verification covers card
contrast, native navigation/validation, reset, external form data, disabled fieldsets, forced
colors, and narrow/enlarged layouts.
Checkbox/Switch tests cover forwarding/ref/events, reactive checked/disabled state, native
form values/reset and required validity, and checkbox mixed clearing. Select tests cover
initial/reactive values, refreshed options, Field associations, validity, form data/reset, and
disabled popup handling. Real browser checks also verify inherited fieldset disabling.
The frontend test setup supplies the browser's initial `animation-name: none` value,
which Happy DOM omits, so Kobalte popup presence can finish cleanup.
Select stories extend axe's overlay-region matcher to include labelled listbox popups:
they are connected to their trigger but portaled outside page landmarks. All other region,
label, role, focus, and contrast checks remain enabled; scan with the popup open too.
Each primitive's interaction and form stories run as portable tests. Playwright verifies
Space, Select navigation/typeahead/dismissal/focus return, popup themes/collision, actual marks/thumb positions, RTL, forced colors, and
narrow/enlarged layouts. Recheck Input after changes to shared private field-control styles.
Layout tests verify semantic form/list composition, native refs and events, and preservation of
input identity, focus, and selection through layout-prop changes. The Responsive Form portable
story checks that changing container width keeps values and submission intact. Container,
Row, Column, and Grid browser stories measure actual gutters, centering, wrapping, gaps,
track widths/counts, and full-row spans. Use Playwright for viewport resize, real focus/tab
order, nested layouts, RTL, and enlarged text; these geometry checks require a browser.
Shell tests cover declarative slots, accessible navigation names, modified/canceled anchor
activation, retained sidebar instances, and independent desktop/mobile state. IconButton,
Tooltip, Navigation, Drawer, and desktop Shell interaction stories also run as portable tests.
The mobile interaction story uses Storybook's phone viewport and must run in the browser.
Use Playwright for native dialog inertness, Escape/backdrop dismissal, focus return, scrolling,
reduced motion, rail tooltip placement, and resizing with a nested Select open. Verify that
the dialog and popup close on desktop return and that drafts survive. Shell/Tooltip stories
extend the same axe overlay-region matcher to tooltips; scan open drawers and popups too.
The [spacing stories](../apps/frontend/src/foundations/spacing/README.md) measure every
quarter-rem step, all four padding edges, and horizontal/vertical gaps with the browser's
layout engine. Check all seven control values and the enlarged-root scenario; these
geometry assertions are not run under Happy DOM.
The [radius stories](../apps/frontend/src/foundations/radius/README.md) use the browser to
check dimensions, all four corner values, and curved hit boundaries across specimen sizes.
They also cover enlarged text and restore document scrolling after their checks.
The [focus stories](../apps/frontend/src/foundations/focus/README.md) check ring colors,
surface contrast, and room for the outline. Four ring/surface contrast tests run in Vitest.
Use real browser Tab/Shift+Tab presses to verify `:focus-visible`, disabled tab stops, computed
outline dimensions, no layout shift, and clipping. Story play checks deliberately do not
move focus; synthetic events cannot establish native input modality. Review both themes,
nested scopes, narrow/enlarged layouts, pointer behavior, and forced-colors emulation.

Solid projects explicitly load [`scripts/testing/jest-dom.ts`](../scripts/testing/jest-dom.ts),
which registers DOM matchers on the Effect Vitest assertions. This prevents the Solid Vite plugin
from automatically adding an unresolved setup path when another package installs Storybook.
Build the workshop with `bun run --filter @amends/design-system build` and the consuming app
with `bun run --filter @amends/web build`. The root `vite-node` override keeps vanilla-extract's
evaluator on its supported Vite 7 line; verify both builds before changing it.

## Choosing a test API

- Use `it.effect` for Effect programs. Return the Effect from the callback; the
  runner owns its scope, interrupts it on timeout, and runs its finalizers.
- Use `it.live` for integrations that need live clocks, such as HTTP servers and
  PostgreSQL's cross-connection append polling.
- Use plain `it` for synchronous schemas and domain functions, DOM interactions,
  and tests of Promise-based subprocess fixtures. These APIs still come from
  `@effect/vitest`.

```ts
import { expect, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

it.effect("completes after the delay", () =>
  Effect.gen(function* () {
    const pending = yield* Effect.sleep("1 minute").pipe(Effect.as("complete"), Effect.forkChild);
    yield* TestClock.adjust("1 minute");
    expect(yield* Fiber.join(pending)).toBe("complete");
  }),
);
```

`it.effect.each` passes each case as one value. Destructure tuple cases with
`([input, expected]) => ...`, or use named object fields. Plain `it.each` spreads
tuple values into separate arguments.

## Helpers and isolation

Test helpers compose and return Effects. Yield them inside the test instead of
starting separate runtimes with `Effect.runPromise`, `runPromiseExit`, or `runSync`.
Use `Effect.flip` to inspect a typed failure and `Effect.exit` when the distinction
between failure, defect, and interruption matters.

Create mutable stores and service layers for each test. Provide layers at the
smallest boundary that owns their resources. Use `Effect.acquireRelease` for
temporary resources and `Effect.scoped` when a helper must release resources
before its caller continues. Use `layer(...)` from `@effect/vitest` only when tests
intentionally share a service lifetime and cannot affect each other's results.

Use `TestClock` for Effect time and `Deferred`, `Queue`, or other explicit signals
for concurrent readiness. Avoid sleeps as synchronization. UI tests use
Testing Library's `waitFor` at the DOM/Promise boundary; wrap those Promises in
`Effect.promise` when composing them inside `it.effect`. Vitest fake timers remain
appropriate for browser timers and atom registries that own separate runtimes.

## Integration resources

SQLite fixtures acquire a temporary directory and close database layers before
removing it. The host's Effect fixtures do the same for HTTP listeners. Subprocess
tests retain the Promise fixture that drains output, bounds startup, and terminates
the child in `finally`; each child uses a temporary database and an ephemeral port.

The PostgreSQL project starts one temporary local cluster for the run, or uses
`AMENDS_POSTGRES_URL` when supplied. Every test creates and drops its own database.
Global teardown stops only the cluster started by the tests. A supplied URL must
allow database creation and deletion. Without that URL or a local PostgreSQL
installation, database suites are reported as skipped; pure PostgreSQL adapter
tests still run. Startup and connection failures fail the run.

## Limits of current coverage

The suite checks journal round trips, transactional behavior, inbox isolation, and
ordinary SSE reconnects. It does not yet include fixed golden bytes for SchemaBinary
payloads, PostgreSQL isolation-default variations or deadlock classification,
repeated Ready/disconnect backoff behavior, or an application request-body limit.
These [known limitations](current-status.md) remain open even when the existing
suite passes. Notification storage and inbox tests seed records; thread workflow tests verify
opening and reply publication, participation admission, recipient selection, concurrent sequencing,
quiet follows, self-unfollow, stale departures, rollback, replay, and departure settlement on both adapters.
Acknowledgment suites verify human ownership, stable repeat handling, source-access loss, caller
transactions, projection/checkpoint rollback, concurrent requests, and replay after departure.
Core tests validate the acknowledgment codec and withholding its facts from the public change feed.

Subprocess fixtures create an existing temporary database parent, so passing host
tests do not prove that the default SQLite path works on a fresh clone. Follow the
[setup guide](../hosts/local/README.md#run) to create that directory first.
