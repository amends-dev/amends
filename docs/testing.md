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
run gallery search and reactive naming as portable tests. Browser review checks new drawings
against their Lunacy reference, then sizes, weights, both modes, and the controls using them.

The [UI workshop](../apps/ui/README.md) runs its Storybook stories as portable tests in Happy
DOM: renders for every foundation, component, pattern, and screen state, and play functions for
their interactions, from sending with Enter and choosing members to the screens' flows such as
sign-in, the workspace picker, the Inbox's selection, and Settings. Each screen's workshop fixture
applies its rules over local state, so those flows play through without a backend. Focused tests
cover the Shell: the navigation drawer below desktop and the side panel beside or over the
content, driven through `test/viewport.ts`, which evaluates the width queries against a width
the test sets. `test/browser-defaults.ts` supplies the browser's initial `animation-name: none`,
which Happy DOM omits, so Kobalte popups can finish unmounting. Happy DOM does not lay out or
paint: compare stories with their Lunacy frames in a browser, in both modes and at phone, touch,
and desktop widths, before relying on them.

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
The `backend` and `postgresql` projects allow each test 20 seconds rather than Vitest's 5: on the
two-CPU runners, sharing the machine with PostgreSQL, their heaviest tests (such as a commit
binding more parameters than one statement can) run about three times slower than on a laptop.

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
owns a sign-in page over client hooks and UI screens.
Their tests exercise real form submission through the generated client, directory
validation before navigation, persistence, safe return destinations, and explicit
recovery. Web also verifies disposal when navigation interrupts verification.
Live backend behavior is verified against a local host in the browser; browser
and native review verify the actual app origins and layouts.

Client's session and directory suites verify headless storage, scope lifetime, query
state, authorization failure, and retry with isolated transports. They require no UI
package or router. Web's application suite verifies safe redirects, route guards,
workspace changes, and credential/request cleanup. Desktop's application suite tests
its independent composition with the real hash router. Each app composes its screens
from UI, whose workshop at port 6010 covers the patterns, components, and screens;
client has no Storybook dependency or workshop.

Client's [sign-in suite](../apps/client/test/sign-in.test.tsx) exercises the generated
HTTP client through isolated fetch transports, including one that resolves after
abort. It covers contract validation, payloads, rejection reasons, malformed session
responses, explicit retry/resend, duplicate guards, and session installation. Explicit
response resolvers and observable abort signals verify email changes, form disposal,
credential replacement, and concurrent controllers without sleeps. These headless
tests complement the app route tests.

Client's settings suite exercises `useWorkspaceSettings` over a scripted transport: how it
shapes the roster and invitations, a stale role change kept through a refresh, an invitation
retried with the same request key, and an invitation whose list refresh failed and completes
once a refresh succeeds. UI's settings stories play the flows over a local fixture, and the
apps' tests cover the settings routes, inviting, and removing.

The local host's HTTP tests exercise desktop CORS preflights, including the generated
client's `b3` tracing header, and 401 response headers.
After changing host runtime setup, also perform the temporary-port startup check.
Verify both app builds and native hash navigation after changing app composition.

Shell's Content stories verify centering, narrow widths, both overflow edges, RTL,
and enlarged text. Whole-page scrolling is tested alongside the existing independent
regions. Theme stories verify nested CSS scopes, font/color-scheme inheritance,
and retained input state. App route tests also check that the skip link focuses
Main without changing the browser route or desktop hash.
