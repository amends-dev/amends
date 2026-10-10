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
bun run test --project @amends-dev/icons
bun run test --project @amends-dev/ui
bun run test --project @amends-dev/client
bun run test --project @amends-dev/web
bun run test --project @amends-dev/desktop
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
Build the workshop with `bun run --filter @amends-dev/ui build`. The root `vite-node` override keeps vanilla-extract's
evaluator on its supported Vite 7 line; verify the workshop build before changing it.

## Local runtime and CPU use

`bun run test` runs the complete suite, including PostgreSQL databases, host subprocesses,
UI stories, and the browser bundle check. Use a file, directory, or project filter while
iterating; watch mode also reuses Vite's in-memory transforms between edits.

```sh
bun run test packages/core/test --watch
bun run test --project @amends-dev/ui
bun run test --project '!@amends-dev/ui'
bun run test --project '!postgresql'
bun run test --maxWorkers=2
```

The UI project runs the workshop's stories and focused component tests. Excluding it leaves
the client and app tests, browser bundle check, and all backend integrations enabled.
It does not remove the cost of creating and migrating PostgreSQL databases for individual
tests. The two-worker command limits concurrent test processes for lower CPU pressure;
the default is four, and fewer workers can take longer.

For changes that do not involve database storage or the host, excluding `postgresql`
keeps the memory adapter's conformance suites and every frontend project. Run the full
suite before relying on integration coverage; CI always includes the PostgreSQL project.

The `backend` and `postgresql` projects reuse Bun worker processes and imported modules
across files (`isolate: false`). Tests must keep mutable stores, service layers, and
acquired resources local to their test scope and restore any global state they change.
Each PostgreSQL test still creates and drops its own database. Frontend projects keep
file isolation because they use DOM and module state. To compare with fresh processes,
run `bun run test --isolate`.

Vitest's duration breakdown and per-file times help distinguish test execution from
import and transform costs. Phase and file totals overlap across workers; they are not
wall-clock totals. Compare runs without concurrent builds, checks, or IDE indexing before
attributing a small timing difference to a configuration change.

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

The harness in `packages/harness` runs everywhere: sessions over fake agents from `test/fakes.ts`,
the bridge's handlers over a fake driver and a file system in memory, without a transport, and the
host tool relay without a transport, with the test clock for its progress notifications and its
time limit. The bridge over a real WebSocket, launched in a local sandbox, and the relay's HTTP
server are tested in the opencode adapter.

The opencode agents in `adapters/harness-opencode` run everywhere against a fake of each of
opencode's session APIs, which the tests script turn by turn. Starting the server, and the bridge
programs a host launches, run everywhere too, against a stand-in for `opencode serve` in
`test/fake-opencode-server.js`, which the tests install as an executable that runs on the Bun
running them. The template's tests run everywhere with its commands answered as a sandbox would
answer them. Its live tests run real opencode under both agents, whose turns OpenCode Zen's free
model answers over the network; they take a few minutes, so they run only with
`AMENDS_TEST_OPENCODE=1`. `AMENDS_TEST_OPENCODE_MODEL` names another of OpenCode Zen's models, and
`AMENDS_TEST_OPENCODE_API_KEY` the key for it. One of them has opencode send turns on endpoints of
each protocol to a fake of their APIs on a local port, to check what opencode sends. Others give
turns instructions, a file, the host's tools across two turns, a request to compact, and a tool that
asks permission, and opencode 1 an answer in JSON. The agents as the bridge runs them run the
opencode on the `PATH`: `opencode`, opencode 1.18, for the opencode 1 agent, and `opencode2`,
opencode 2.0, for the opencode 2 agent, or the command `AMENDS_TEST_OPENCODE2_COMMAND` names. The
agents as hosts run them run the Bun and opencode their template installs in this machine's home,
under `~/.amends/opencode`, once for each version; the template's own live tests install them afresh
in a temporary home directory. Each keeps opencode's configuration and data in temporary
directories, apart from this machine's opencode. With `AMENDS_TEST_DAYTONA=1` and `DAYTONA_API_KEY`
too, the hosts' tests also run on Daytona, in sandboxes started from the snapshot of the template's
version once Daytona has made it.

The sandbox providers in `adapters/sandbox-local` and
`adapters/sandbox-daytona` run the suites `@amends-dev/sandbox/conformance` exports, and
`packages/sandbox/test` checks the contract's own rules, such as what names a template. The local
provider's run everywhere. Daytona's, and its own tests of what it asks of Daytona and the network
policies Daytona enforces, create real sandboxes and cost money, so they run only with
`AMENDS_TEST_DAYTONA=1` and `DAYTONA_API_KEY`, which Bun reads from the repository's Git-ignored
`.env`; they take about a minute. Daytona's provider also checks, everywhere, that options Daytona
does not take fail a create before Daytona is asked.

`packages/connection` and `adapters/harness-amends` run everywhere against fakes: a client
that answers as each model API does, an MCP server in the test's process, and an HTTP API with an
OpenAPI document. Their live tests reach real model providers and run only with
`AMENDS_TEST_MODELS=1`: amends's agent runs turns on a free OpenRouter model, with
`OPENROUTER_API_KEY` from the `.env` as `bun --env-file=hosts/local/.env` gives it, one of them in
a sandbox on this machine, where it runs a command; and checks of connections find the keys
Anthropic, OpenAI, OpenRouter, and DeepSeek refuse, and OpenRouter's own. None of them costs
anything.

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
ordinary SSE reconnects. Fixed SchemaBinary fixtures cover representative workspace,
message, and turn-checkpoint payloads from rc.115; other payload variants remain unverified.
The suite does not yet include PostgreSQL isolation-default variations or deadlock classification,
or repeated Ready/disconnect backoff behavior.
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
client's `b3` tracing header, and 401 response headers. Its sandbox integrations are tested
everywhere, Daytona's against a fake of Daytona's API in the test's process; with
`AMENDS_TEST_DAYTONA=1` and `DAYTONA_API_KEY`, they also check a real organization's key and
create a sandbox through a connection. Its harness integrations are tested everywhere, amends's
agent over scripted models and opencode as far as its bundled bridge. With `OPENROUTER_API_KEY`
from the `.env` too, they set the agents up as the host does from a workspace's connections, on
OpenRouter's free model: with `AMENDS_TEST_MODELS=1`, amends's agent runs a turn calling the tool
of an MCP connection to a server on this machine; with `AMENDS_TEST_OPENCODE=1`, opencode runs a
turn under each of its integrations in this machine's sandboxes or, with `AMENDS_TEST_DAYTONA=1` and `DAYTONA_API_KEY`, Daytona's.
After changing host runtime setup, also perform the temporary-port startup check.
Verify both app builds and native hash navigation after changing app composition.

Shell's Content stories verify centering, narrow widths, both overflow edges, RTL,
and enlarged text. Whole-page scrolling is tested alongside the existing independent
regions. Theme stories verify nested CSS scopes, font/color-scheme inheritance,
and retained input state. App route tests also check that the skip link focuses
Main without changing the browser route or desktop hash.
