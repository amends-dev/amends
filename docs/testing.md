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
Control-color tests add eight plain border pairings and eight overlay/surface combinations.
The development-only blend helper has endpoint and unsupported-input tests. Browser play
checks verify actual colors and alpha, compare text/border contrast after compositing, and
cross-check the blend against an sRGB canvas render. Review all Controls stories, including
nested themes, theme switching, and narrow/enlarged layouts; these browser checks do not run
under Happy DOM.
The [typography stories](../apps/frontend/src/foundations/typography/README.md) run browser
play checks for real font loading, computed metrics, and wrapping. They are intentionally
excluded from Happy DOM portable-story tests because that environment cannot verify font
rendering. Review their Interactions and Accessibility panels in Storybook, including the
narrow and enlarged-text scenarios.
The [Text primitive](../apps/frontend/src/primitives/text/README.md) has DOM tests for
native semantics, forwarding, refs, class merging, and reactive updates, plus compile-time
usage checks. Its Reactive Props story also runs through the portable-story suite; actual
colors, typography, margins, and wrapping are verified in the browser.
The [Button primitive](../apps/frontend/src/primitives/button/README.md) has DOM and type checks
for native semantics, prop/ref/event forwarding, disabled activation, explicit form submission,
preventing default, and reactive updates, including variant changes that preserve focus and the element. Activation
and Forms for both variants, plus Reactive Props, run as portable
stories. Real browser checks cover native Enter/Space/Tab input, actual state colors and outlines,
inherited fieldset disabling, narrow/enlarged labels, coarse pointers, and forced colors.
Button Comparison additionally checks both variants' computed fills, text, borders, and
composited contrast against the current palette. Run it
after shared color changes to catch stale dependent styles in the development server, even
when the standalone color stories and production build pass.
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
