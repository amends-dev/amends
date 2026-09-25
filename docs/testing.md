# Testing

All tests import their test APIs from `@effect/vitest`. The root dependency uses
the same catalog release as Effect. Vitest runs on Bun so host tests exercise the
application's runtime. Oxlint rejects imports from `bun:test` and
direct test API imports from `vitest`.

## Commands

Run these commands from the repository root:

```sh
bun run test
bun run test packages/core/test
bun run test --project backend
bun run test --project postgresql
bun run test --project @amends/icons
bun run test --project @amends/ui
bun run test --project @amends/features
bun run test --project @amends/client
bun run test --project @amends/web
bun run test --project @amends/desktop
bun run test --watch packages/core/test
bun run check
```

The root configuration discovers only application tests. The `backend` project
covers shared packages and the memory adapter. The `postgresql` project covers the
PostgreSQL adapter and the local host, which stores in PostgreSQL, under one global setup. UI, client, web, and desktop use Solid/Vite transforms and Happy DOM. Client tests
headless state; web and desktop test their own route/UI integration, and web's bundle test builds the app and fails when
core's implementation reaches the browser bundle; verify both frontend builds and desktop
startup as described in the [desktop guide](../apps/desktop/README.md#run-and-verify). Vendored repositories are outside test discovery.

The [icons package](../apps/icons/README.md) tests geometry validation, composition,
Solid naming/prop reactivity, and consumer bundles. Its build tests run in the Node
environment on Bun, invoke the generator with a timeout, and verify that individual
icon imports exclude unrelated geometry and metadata-only imports exclude Solid.
`bun run check:icons` verifies generated files without writing; it is included in
`bun run check` and the pre-commit hook. The UI package's Foundations / Icons stories
provide Marks selection, gallery search, and reactive naming portable tests. Browser
review compares all 26 SVG marks with the Primitives v2 reference at 15px, then checks
sizes, weights, both themes, affected controls, RTL, and enlarged root text.

The new [UI workshop](../apps/ui/README.md) uses portable Storybook render/play scenarios to verify its Solid rendering and interaction setup. Build it independently
with `bun run --filter @amends/ui build`; no existing UI is imported into this package.
Its [color foundation](../apps/ui/src/foundations/color/README.md) tests eight reading
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
The [typography stories](../apps/ui/src/foundations/typography/README.md) run browser
play checks for real font loading, computed metrics, and wrapping. They are intentionally
excluded from Happy DOM portable-story tests because that environment cannot verify font
rendering. Review their Interactions and Accessibility panels in Storybook, including the
narrow and enlarged-text scenarios.
The [Text primitive](../apps/ui/src/primitives/text/README.md) has DOM tests for
native semantics, forwarding, refs, class merging, and reactive updates, plus compile-time
usage checks. Its Reactive Props story also runs through the portable-story suite; actual
colors, typography, margins, and wrapping are verified in the browser.
Semantic Text stories check actual status colors and 4.5:1 contrast on plain and matching
soft backgrounds, including nested inheritance. DOM/type tests verify semantic tone changes
preserve the element and do not add live-region semantics.
The [Button primitive](../apps/ui/src/primitives/button/README.md) has DOM and type checks
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
IconButton's Circular Interaction story runs pointer and keyboard activation with a text glyph;
browser review checks its 34px circular geometry, coarse-pointer target, both themes,
enlarged text, and forced colors.
The [Input primitive](../apps/ui/src/primitives/input/README.md) has native-prop, ref/event,
reactivity, selection, validity, form-data, reset-default, and type checks. Editing and Forms
run as portable stories. Browser Comparison verifies actual themed colors, placeholders,
radius, and inherited-disabled form-data exclusion (Happy DOM does not model that exclusion).
Use Playwright for native typing/Enter/Tab, invalid focus, read-only selection, forced colors,
long values, 320px layouts, and enlarged text. Radius specimens include the 10px medium token;
Controls specimens include the invalid-border role independently of Input.
Field Comparison also checks the mock-aligned label/help/error typography and semantic
colors in both themes. Reference shows the compact field treatments; the error prefix stays
in accessible descriptions while its decorative dot supplies the visible marker.
The [CodeInput primitive](../apps/ui/src/primitives/code-input/README.md) has DOM/type
tests for native associations, validity, reset defaults, and reactive selection. Editing,
Forms, and Layout run as portable stories; Comparison checks glyph alignment in the browser.
Review real keyboard replacement, paste, undo, Enter/Tab, forced colors, RTL, and 320px
layouts with enlarged text. Resizing between six cells and compact entry must retain the
input, value, and selection. Device autofill and native desktop remain platform checks.
The [SignInEmailForm](../apps/ui/src/features/sign-in/README.md) tests cover controlled
drafts, native and caller-supplied validation, pending guards, retry, and reset ownership.
Validation, Request Recovery, and Layout run as portable stories. Browser review covers
real Enter/Tab, focus retention, inherited disabled-fieldset submission, both themes,
RTL, long content, enlarged text, and accessibility. These are presentation fixtures;
the [feature workshop](../apps/features/README.md) verifies the connected flow
through the real HTTP host and PostgreSQL.
SignInCodeForm adds portable scenarios for validation, verification recovery, resend
failure/retry, changing email while pending, and resizing. DOM/type checks cover
exclusive pending actions, explicit submission, leading zeros, caller-owned feedback,
reset, and isolated instances. Browser review checks native keyboard/paste, focus,
inherited disabled-fieldset guards, RTL, and enlarged text. Resend must bypass code
validation; changing email must remain available during either request.
The [Field composition](../apps/ui/src/compositions/field/README.md) has DOM/type tests for
unique identities, native label/description associations, external-description deduplication,
wrapper props, required/disabled/error changes, and control identity/focus/selection retention.
Its reactive and form stories run as portable tests. Browser review verifies real label clicks,
validation focus, native submission, disabled tab stops, narrow/enlarged message wrapping,
forced colors, and error-text contrast. Four additional contrast tests cover `text.invalid`.
The [Radio primitive](../apps/ui/src/primitives/radio/README.md) has DOM/type tests for
forwarding, reactive checked/disabled props, native grouping, form values/reset, and fieldset
disabling. Interaction and Forms run as portable stories. Use Playwright for native Tab/arrows/
Space, label activation, state colors, forced colors, and narrow/enlarged labels.
The [RadioGroup composition](../apps/ui/src/compositions/radio-group/README.md) tests
controlled callbacks, group isolation, associations, refreshed-option identity/focus, removed
or disabled selections, native attributes, and duplicate values. Plain/card interaction and
form stories plus refreshed options run as portable tests. Browser verification covers card
contrast, compact legend/option/help typography, the shared error dot and accessible prefix,
native navigation/validation, reset, external form data, disabled fieldsets, forced colors,
and narrow/enlarged layouts.
Checkbox/Switch tests cover forwarding/ref/events, reactive checked/disabled state, native
form values/reset and required validity, and checkbox mixed clearing. Select tests cover
initial/reactive values, refreshed options, Field associations, validity, form data/reset, and
disabled popup handling. Real browser checks also verify inherited fieldset disabling.
The UI test setup supplies the browser's initial `animation-name: none` value,
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
Avatar/Status DOM and type tests cover named/decorative semantics, fallback content,
reactivity, native refs/classes, and explicit announcement behavior. Their portable stories
exercise identity changes, keyboard button composition, and status presentation changes.
Avatar text/surface pairs join the color contrast/gamut tests. Browser review checks both
surfaces/themes, actual shapes and colors, long labels, enlarged text, RTL, and forced colors.
Divider's portable action story and DOM/type tests keep labels/headings and buttons accessible
while only line segments are hidden. Its Layout story checks centering, equal line lengths,
full-width standalone lines, and actual dashed borders in the browser. Review long labels,
RTL, enlarged text, and forced colors. Navigation's interaction story and DOM tests cover
retained section actions, collapsed visibility, section names, and focus recovery to a link.
Shell tests cover declarative slots, accessible navigation names, modified/canceled anchor
activation, retained sidebar instances, and independent desktop/mobile state. IconButton,
Tooltip, Navigation, Drawer, and desktop Shell interaction stories also run as portable tests.
The mobile interaction story uses Storybook's phone viewport and must run in the browser.
Use Playwright for native dialog inertness, Escape/backdrop dismissal, focus return, scrolling,
reduced motion, rail tooltip placement, and resizing with a nested Select open. Verify that
the dialog and popup close on desktop return and that drafts survive. Shell/Tooltip stories
extend the same axe overlay-region matcher to tooltips; scan open drawers and popups too.
Tooltip's Reference and Comparison stories support checking the Primitives v2 label's type,
padding, corners, shadow, and start alignment. Check pointer movement into the popup, Escape,
keyboard focus, narrow/long content, and enlarged text in the browser. The color tests verify
the dedicated tooltip foreground/background pair independently from canvas/panel pairings.
Dialog and Toast have focused DOM and portable-story tests for modal state/associations,
drafts, pending/error recovery, toast queue isolation, remaining-time pauses, action persistence,
and focus recovery. Timer tests use Vitest fake timers in these synchronous UI tests.
Use their browser stories for native Tab containment, dismissal, nested Select and toast
interaction inside a dialog, Alt+T, viewport overflow, enlarged text, forced colors, and reduced motion.
Toast text/action colors have dedicated contrast tests and a foundation specimen.
The [Popover composition](../apps/ui/src/compositions/popover/README.md) runs portable
stories for content actions, guarded closing, controlled state, icon triggers, and mounting
in native Dialog and Drawer. Browser checks cover Escape/outside focus behavior, edge
placement, narrow and enlarged text, RTL, theme colors, forced colors, and Storybook accessibility.
The [spacing stories](../apps/ui/src/foundations/spacing/README.md) measure every
quarter-rem step, all four padding edges, and horizontal/vertical gaps with the browser's
layout engine. Check all seven control values and the enlarged-root scenario; these
geometry assertions are not run under Happy DOM.
The [radius stories](../apps/ui/src/foundations/radius/README.md) use the browser to
check dimensions, all four corner values, and curved hit boundaries across specimen sizes.
They also cover enlarged text and restore document scrolling after their checks.
The [focus stories](../apps/ui/src/foundations/focus/README.md) check ring colors,
surface contrast, and room for the outline. Four ring/surface contrast tests run in Vitest.
Use real browser Tab/Shift+Tab presses to verify `:focus-visible`, disabled tab stops, computed
outline dimensions, no layout shift, and clipping. Story play checks deliberately do not
move focus; synthetic events cannot establish native input modality. Review both themes,
nested scopes, narrow/enlarged layouts, pointer behavior, and forced-colors emulation.

Solid projects explicitly load [`scripts/testing/jest-dom.ts`](../scripts/testing/jest-dom.ts),
which registers DOM matchers on the Effect Vitest assertions. This prevents the Solid Vite plugin
from automatically adding an unresolved setup path when another package installs Storybook.
Build the workshop with `bun run --filter @amends/ui build`. The root `vite-node` override keeps vanilla-extract's
evaluator on its supported Vite 7 line; verify the workshop build before changing it.

## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on pull requests to `main` and
pushes to it, as parallel jobs, so a run takes as long as its slowest job:

| Job            | Runs                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| Static         | Lint, format, package boundaries, generated icons, and the PostgreSQL migration          |
| Types          | `bun run typecheck`                                                                      |
| Tests          | `backend`, `postgresql` in three shards, and the app projects together, two workers each |
| Frontend build | The web and desktop bundles and both workshops                                           |
| Check          | Succeeds only when every job above does; require it for merging                          |

Each job installs the pinned Bun and the locked dependencies through
[`.github/actions/setup`](../.github/actions/setup/action.yml), which caches Bun's packages by
lockfile. A new push to a pull request cancels its earlier run. The PostgreSQL shards each start a
throwaway cluster from the runner's installation with `AMENDS_POSTGRES_REQUIRED=true`. The
migration step regenerates the baseline and fails if anything changes. When one project's tests
outgrow their job, give it its own matrix entry or more shards; `--shard` splits by test file.

[`.github/workflows/native.yml`](../.github/workflows/native.yml) runs desktop's `cargo fmt` and
`cargo check` only when `apps/desktop/src-tauri` or the workflow changes, with Tauri's Linux
libraries and a Rust build cache.

## Choosing a test API

- Use `it.effect` for Effect programs. Return the Effect from the callback; the
  runner owns its scope, interrupts it on timeout, and runs its finalizers.
- Use `it.live` for integrations that need live clocks, such as HTTP servers and
  PostgreSQL's cross-connection append notifications.
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

The PostgreSQL project starts one temporary local cluster for the run, or uses
`AMENDS_POSTGRES_URL` when supplied. Every test that opens storage creates and drops
its own database, and closes its database layers and HTTP listeners first. Global
teardown stops only the cluster started by the tests. A supplied URL must allow
database creation and deletion. Without that URL or a local PostgreSQL installation,
database suites are reported as skipped; pure PostgreSQL adapter tests and host tests
that never open storage still run. With `AMENDS_POSTGRES_REQUIRED=true`, as in CI, a missing
server fails the run instead. Startup and connection failures fail the run.

Subprocess tests keep the Promise fixture that drains output, bounds startup, and
terminates the child in `finally`; each child uses its own database and an ephemeral
port. Tests that need a database run the fixture inside `it.live` over the Effect
that creates it.

## Storage conformance

The [conformance suites](../packages/storage-conformance/README.md) specify storage
behavior once and run it on every adapter. Each adapter's `test/harness.ts` supplies
fresh storage per test, further hosts over it, a way to discard projections before replay,
and a count of stored records for rollback checks. A test file registers one suite, such as
`Suites.journal(harness)`, and adds tests only for what that adapter stores or fails
differently. The memory adapter runs the same suites as the reference implementation; its
tests run in the `backend` project.

The suites cover the journal and transactions, direct store contracts, and every workflow the
stores serve: workspaces, access, invitations, the gateway, groups, threads, notifications, and
read state. Each adapter's own tests cover only construction, access paths, and what it stores or
fails differently.

## Limits of current coverage

The suite checks journal round trips, transactional behavior, inbox isolation, and
ordinary SSE reconnects. It does not yet include fixed golden bytes for SchemaBinary
payloads, PostgreSQL isolation-default variations or deadlock classification,
repeated Ready/disconnect backoff behavior, or an application request-body limit.
These [known limitations](current-status.md) remain open even when the existing
suite passes. Notification storage and inbox tests seed records; thread workflow tests verify
opening and reply publication, participation admission, recipient selection, concurrent sequencing,
quiet follows, self-unfollow, stale departures, rollback, replay, and departure settlement on every adapter.
Acknowledgment suites verify human ownership, the first time kept on repeats, source-access loss,
caller transactions, failed writes, concurrent requests from two hosts, and that `Seen` writes
nothing to the journal and survives rebuilding projections. The `changeFeed` conformance suite runs the feed on each adapter: commits from another host,
resuming on another host, and thread activity reaching only the group's readers.

Subprocess fixtures create each database before starting the host, so passing host
tests do not prove that startup works against a database you configure. Follow the
[setup guide](../hosts/local/README.md#run) to create it first.

## Application foundation

Web and desktop declare their router trees as children of `Application`. Each
owns a sign-in page built from UI primitives and declarative `SignIn` parts.
Their tests exercise real form submission through the generated client, directory
validation before navigation, persistence, safe return destinations, and explicit
recovery. Web also verifies disposal when navigation interrupts verification.
Live backend behavior is covered by the shared feature scenarios below; browser
and native review verify the actual app origins and layouts.

Client's session and directory suites verify headless storage, scope lifetime, query
state, authorization failure, and retry with isolated transports. They require no UI
package or router. Web's application suite verifies safe redirects, route guards,
workspace changes, and credential/request cleanup. Desktop's application suite tests
its independent composition with the real hash router. Each app composes its bootstrap
screens from UI primitives. UI's workshop at port 6007 covers the shared foundations
and components; client has no Storybook dependency or workshop.

Client's [sign-in suite](../apps/client/test/sign-in.test.tsx) exercises the generated
HTTP client through isolated fetch transports, including one that resolves after
abort. It covers contract validation, payloads, rejection reasons, malformed session
responses, explicit retry/resend, duplicate guards, and session installation. Explicit
response resolvers and observable abort signals verify email changes, form disposal,
credential replacement, and concurrent controllers without sleeps. These headless
tests complement the connected feature scenarios below.

The features suite runs the same eight Storybook play scenarios against the real
local HTTP handlers, gateway, development authentication, and PostgreSQL. Each
scenario owns a temporary database, captured codes, and an in-memory session.
Success also validates the credential against the directory. Request gates and an
auth-only clock offset exercise pending work, expiry, and recovery without sleeps.
The subprocess fixture disables environment-file loading and ignores
`AMENDS_DATABASE_URL`; PostgreSQL discovery uses `AMENDS_POSTGRES_URL` or a local
installation, and fails clearly if neither exists. Tests close scenarios before
stopping the host. Run `bun run --filter @amends/features dev` for browser review
at port 6008 (HMR 6009), and `bun run --filter @amends/features build` to verify its
bundle. The static bundle needs the development backend/proxy to run live stories.

The local host's HTTP tests exercise desktop CORS preflights, including the generated
client's `b3` tracing header, and 401 response headers.
After changing host runtime setup, also perform the temporary-port startup check.
Verify both app builds and native hash navigation after changing app composition.

Shell's Content stories verify centering, narrow widths, both overflow edges, RTL,
and enlarged text. Whole-page scrolling is tested alongside the existing independent
regions. Theme stories verify nested CSS scopes, font/color-scheme inheritance,
and retained input state. App route tests also check that the skip link focuses
Main without changing the browser route or desktop hash.
