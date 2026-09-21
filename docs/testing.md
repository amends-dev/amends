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
bun run test --project @amends/web
bun run test --watch packages/core/test
bun run check
```

The root configuration discovers only application tests. The `backend` project
covers shared packages, SQLite, and the local host. PostgreSQL has its own project
and global setup. The UI and web projects use their Solid/Vite transforms and
Happy DOM environments. Vendored repositories are outside test discovery.

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

Subprocess fixtures create an existing temporary database parent, so passing host
tests do not prove that the default SQLite path works on a fresh clone. Follow the
[setup guide](../hosts/local/README.md#run) to create that directory first.
