# Project guidance

Use Bun for dependency installation, scripts, and application execution.
Use TypeScript 7 for type-checking, Oxlint for linting, and Oxfmt for formatting. Oxfmt formats as
Effect's dprint does: 120 columns, no semicolons, no trailing commas, and imports sorted. A
module's header is followed by a blank line, which keeps it first when the imports below it sort.
Run `bun run check` after changes and `bun run test` after changing behavior.
Tests use `@effect/vitest` through Vitest running on Bun. Use `it.effect` for Effect
programs, `it.live` only for integrations that need live clocks, and plain `it`
for synchronous assertions and Promise-based UI or subprocess tests. Test helpers
return Effects; do not run them with `Effect.runPromise` or `Effect.runSync`.
Use `TestClock` and explicit concurrency signals, and scope acquired resources.
See [docs/testing.md](docs/testing.md) for commands, fixtures, and examples.
`bun run start` serves the local host on port 8787 and keeps running; it requires
`AMENDS_DATABASE_URL`, a PostgreSQL database URL. After changing runtime setup,
create a temporary database, start the host in the background with `AMENDS_PORT=0`
and `AMENDS_DATABASE_URL` naming it, confirm the "Listening on" line, stop it, and
drop the database. The host tests also spawn the server entry point. Use
`bun run format` and `bun run lint:fix` to apply formatting and safe lint fixes.

`bun install` runs `effect-tsgo patch` and `lefthook install` through the `prepare`
script. This enables Effect diagnostics in the TypeScript compiler and workspace
language server, and installs the Git hooks. Before each commit, Lefthook runs
dependency boundary, generated-barrel, generated-icon, type, lint, and formatting checks in parallel
across the working tree.
The hook checks files without modifying or staging them. Fix failures before
committing; `bun run lefthook run pre-commit --force` runs the same checks manually,
even when no files are staged. CI runs these checks, the tests, and the frontend builds
as parallel jobs; see [continuous integration](docs/testing.md#continuous-integration).
Keep these diagnostics enabled in `tsconfig.base.json`: the pinned Oxlint version is
newer than the versions supported by the Effect Oxlint patch, so Effect checks
currently run through TypeScript. Check compatibility before changing this setup.
`tsconfig.base.json` raises the language service's idiom rules, such as `Effect.void` over
`Effect.succeed(undefined)` or `Effect.catchTag` over a catch-all that re-fails, to warnings,
which fail `typecheck`; the few that only fit source, such as `deterministicKeys` for service
keys, are off in tests and scripts. `anyUnknownInErrorContext` keeps `unknown` and `any` out of
the packages' error channels; the apps' failures are still classified from `Cause<unknown>`, so it
is off there too. Source reaches the platform through Effect: `Config` rather than `process.env`,
the `Crypto` service rather than `crypto.randomUUID`, `Schema.is` rather than `instanceof` on a
schema class, and no `console` or timers; tests and scripts are exempt, and the apps keep their
UI's timers and request keys. Converting a known time with `Date`, as Effect's own source does, is
allowed; reading the clock goes through `Clock` or `DateTime`.
`.oxlintrc.json` takes the rules of Effect's own Oxlint configuration
(`repos/effect/packages/tools/oxc/oxlintrc.json`), with its type-aware rules off as Effect
runs them, and keeps `console` to tests and scripts.

## Workspace layout

- `packages/*`: portable shared packages. Effect is their only external dependency, besides
  `@effect/vitest` for test suites a package ships from the root catalog. They may depend on other
  shared packages with `workspace:*`, but never hosts or apps. This applies to all dependency
  sections; development tools live at the root. `core` operates within one workspace with a trusted
  actor; its services are the operations. Each core feature keeps the operations actors call in
  its service module, such as `ThreadService`, the internal writes other operations share in one
  command service, `ThreadCommand`, and the internal reads in one query service, `ThreadQuery`; a
  command may read through the query, a query never writes, and a step with one caller stays a
  private function of that caller. `gateway` is how a
  host enters core: it bootstraps a workspace and resolves an authenticated identity into the actor,
  and it holds the host contracts for storage, accounts, sign-in, session token resolution, and the
  workspace directory. `http` is the HTTP protocol: the contract clients call, which they import by
  module, and the handlers that implement it over the gateway, including its authentication. Another
  protocol adds its own package over the same gateway rather than new gateway methods. The gateway's
  `conformance` module holds the test suites every storage adapter runs against itself through a
  fixture: what the storage contracts promise, from transactions and logs to accounts, across hosts
  over the same storage. The gateway's tests run them over the memory implementation, and test
  core's operations as a host runs them; adapter tests keep only what one adapter stores or fails
  differently. `harness` is the contract every harness implements: an agent's sessions and turns,
  streamed in one format whichever agent runs them, and the bridge through which a host drives an
  agent inside a sandbox. `sandbox` is the contract every sandbox provider implements, with the
  suites each provider runs from `@amends-dev/sandbox/conformance`; a sandbox knows nothing of what
  harness runs inside it. `toolkit` gives every kind of tool source, such as an MCP server or an
  HTTP API, one shape. `channel` is the contract every channel transport implements: how one
  external system's conversations are received and replied to; an adapter implements it for one
  system, and the host declares that system's integration. `connection` holds the integrations a
  host installs, what each gives a workspace's connections
  (models, tools, sandboxes, harnesses, and channels), and the model catalog. `cluster` runs jobs,
  the work outside requests, on Effect Cluster: entities whose requests a commit stores, with their
  retries and pruning. Jobs enter workspaces through the gateway like any other caller. Its turn
  job, one for each agent in each thread, runs the agent's turns on `harness` and writes their
  session logs.
- `adapters/*`: implementations of gateway contracts over one external system, with
  that system's dependencies. `harness-amends` is amends's own agent, a loop over Effect AI's
  `LanguageModel` with the model providers' clients, and `harness-opencode` runs opencode behind its
  bridge in a sandbox; each gives the integration a host installs. `sandbox-local` and
  `sandbox-daytona` implement the sandbox contract over this machine's directories and over
  Daytona, and depend on it and their platform's SDK alone; the host declares their integrations.
  `codemode-opencode` implements the toolkit's `CodeRuntime` over `@opencode/codemode`, opencode's
  interpreter for code mode; the root manifest's `overrides` keeps that package on the catalog's
  Effect until it declares Effect as a peer.
  `storage-postgresql` implements workspace storage, the workspace directory, accounts, and sign-in
  storage over PostgreSQL with Drizzle and `@effect/sql-pg`, one column per record field, except
  the kind-specific `details` of a thread activity or a session log entry, stored as JSON. The
  reference implementation of the same contracts, in process memory, is each contract's
  `layerMemory`, beside it in core and the gateway, which their tests run over. Both follow one
  shape: each store over a workspace binding, merged at the edge.
  Hosts compose adapters and implement no storage themselves; shared packages never
  depend on adapters.
- `hosts/*`: runtime composition, such as the Bun host in `hosts/local`, which serves
  the HTTP API over the PostgreSQL adapter at `AMENDS_DATABASE_URL`, with development
  sign-in and credentials.
  Hosts may install their runtime's dependencies and consume shared packages. A host
  implements gateway contracts and serves protocol packages' handlers; its tests act as a
  client through the same package's contract.
- `apps/*`: user-facing clients, the site, and shared UI. `icons` holds canonical drawings and
  generated Solid icons, raw SVGs, and a separate metadata catalog; apps and UI packages may consume
  it. `ui` is the pattern-based design system built from the Lunacy mocks in
  `design-system/Amends Group Exploration.free`, which are its visual reference: foundations,
  components, the six layout patterns, presentational screens, and the site's sections, with a
  standalone Storybook workshop.
  Introduce and verify one piece at a time. It is UI-only and must not depend on client state,
  routing, or API contracts. `client` owns headless session lifetime, typed API access, query state,
  the view hooks screens connect through, and pure route helpers. UI never depends on client. Client
  takes UI as a development dependency only to type what its hooks return as the screens' own types,
  through type-only imports, and imports no UI code. `web` and `desktop` consume these libraries and
  own route trees, page composition, API URL, and persistence configuration; each page connects
  client hooks to UI screens. `desktop` owns the Tauri shell; platform APIs stay in the entry apps.
  `site` is amends.dev on Astro and Starlight: static pages composed from UI's site sections without
  client, and docs whose package guides and API reference are generated from each published
  package's README and source, deployed with [Alchemy](https://alchemy.run) from its
  `alchemy.run.ts`; `stacks/` holds Alchemy stacks for the repository itself, such as its CI
  secrets. Apps may install UI dependencies and consume shared packages. Run
  desktop's `check:native` after changing Rust or Tauri configuration; root checks cover its
  TypeScript only.

Each workspace has its own manifest, source exports or entry point, `tsconfig.json`
extending `tsconfig.base.json`, and `typecheck` script. Shared packages inherit no
runtime-specific global types; hosts and apps opt into their own environments.
`tsconfig.base.json` takes Effect's strict flags: `exactOptionalPropertyTypes`, so an optional
field that may be given `undefined` says so as `readonly x?: X | undefined`; unused locals and
parameters; and erasable syntax only. The apps turn `exactOptionalPropertyTypes` off until their
UI props are written for it.
Root `tsconfig.json` checks repository scripts, shared-package tests, and the Vitest
configuration; `bun run typecheck` checks these and every workspace. Use declared
package names for cross-workspace imports, not relative paths into another workspace.

Compose pages and UI declaratively through nested children and named parts. Use props for data,
options, and callbacks rather than custom slots carrying whole components or JSX trees. Follow
framework-required render APIs where needed. Pages live in `apps/web`, `apps/desktop`, and
`apps/site`; UI owns reusable visual pieces, and client owns connected state and actions as hooks.
Neither shared package owns application pages.
UI screens are presentational: they take data and callbacks and render a pane or
the navigation, while the apps own routes, data, and which screen shows.
Every rail destination follows one navigation pattern
([workspace shell](docs/workspace-shell.md)): its sidebar lists its items with Browse and
Create, the main content shows the list or one item with tabs as links, and the side panel holds
only something inside what the main content shows. A page about one item puts its sections in
`Pane.Column`, one column; never lay details or forms side by side in the main content.

Web, desktop, and site compose UI; they do not define styles, style elements, inline style objects,
or local stylesheets. Shared UI stylesheet/font imports and component options are allowed. Before
filling a visual gap, inspect the existing components (including Shell), evaluate whether a reusable
addition fits the design system, and verify that UI component in its workshop before composing it
into an app page.

Use the root Bun catalog for Effect package versions and `workspace:*` for local
package links, except that a published package links to another with `workspace:^`, which publishes
as a caret range ([publishing](docs/publishing.md#versions)). Run `bun install` at the repository
root after manifest changes.
`bun run check:packages` checks shared-package dependency declarations. A barrel, an `index.ts`
marked `// @barrel`, is generated as Effect's are: `bun run barrels` lists every module beside it,
and `bun run check:barrels` fails when one is out of date.

## Design and review

Code is judged by how a newcomer reads it, not only by whether it works. Hold to these when
writing code, and when asked whether code is well structured:

- One word per concept in every layer: work a commit asks for and Cluster runs is a job, from
  core to the cluster package. A second name for the same thing, or one name for two things, is a
  defect to fix.
- A layer, wrapper, or factory that only forwards is removed, not kept for symmetry with another.
- Small or closely related code goes into an existing package as a module or folder. Add a
  package only when dependency direction requires one, and say why.
- A flow reads top to bottom. Long work is a loop over named steps, and a decision is a pure
  function, separate from the code that performs it.
- Names say what things do, as [Effect](#effect) describes; names a letter apart that do
  different things, such as `expose` and `exposed`, are defects.
- When something needs a paragraph or a vocabulary table to explain, change the code so it does
  not.

When reviewing, first sketch how the part would look if built today from what it does, then list
how the current code differs. Walk its main flow as a newcomer and note every point that raises
"why is this here?". Guides and patterns already in the repository describe what exists; they are
not reasons to keep it.

## Documentation

[docs/README.md](docs/README.md) indexes current guides, design intent, and historical
references. Update affected READMEs and guides when changing commands, configuration,
contracts, behavior, or test setup. Check claims against implementation and tests;
an agreed design or a passing round-trip test does not establish an implemented
feature or compatibility across dependency upgrades.

Keep [known limitations](docs/current-status.md) aligned with the owning source and
guides. Remove a limitation when its implementation and relevant verification are
complete. Preserve the status of proposals and historical notes instead of presenting
them as current behavior. Check relative links and heading anchors after moving or
renaming documentation. `CLAUDE.md` is a symlink to this file; keep one guidance source.

## Effect

This project uses stable Effect v4. The root `package.json` workspace
catalog and `bun.lock` define the installed versions; keep Effect dependencies and the vendored source
on the same release when upgrading.

Before writing Effect code, read `repos/effect/LLMS.md`, then inspect the relevant
implementation, examples, and tests in `repos/effect`. Use this matching source
to verify APIs rather than guessing from prior versions or web snippets.

- Core modules and tests: `repos/effect/packages/effect/src` and
  `repos/effect/packages/effect/test`.
- Usage examples: `repos/effect/ai-docs/src`.
- Bun integration: `repos/effect/packages/platform/bun`.
- Domain design: `docs/core-model.md`.

Source imports Effect by module, `import * as Effect from "effect/Effect"`, as Effect's packages
do; tests, scripts, and documentation examples may use the `effect` barrel.

Tell which variant a tagged value is with the helpers its type gives, never by comparing `_tag`:
`X.isAnyOf(["A"])` for a value of a schema's tagged union, which checks the tag alone, and `X.match`
for a case per variant, or `Match.valueTags` when the cases return different types; `$is` and
`$match` for a `Data.TaggedEnum`; and the guards Effect's modules give their own types, such as
`Option.isSome`, `Exit.isSuccess`, and `ChildProcess.isPipedCommand`. A union's `guards` validate
the whole value, so keep them for input of unknown shape. Recover from one reason of an error with
`Effect.catchReason`. An error's reasons are `Schema.TaggedError` classes that say `isRetryable` and
give a default message, in a union piped through `Schema.toTaggedUnion("_tag")`, as harness's
`HarnessError` shows. Reading `_tag` as data, such as the kind a row stores, is fine.

Build a variant in source with its constructor, `Union.cases.Member.make({ memberId })`, which
checks it as decoding would and throws when it does not hold. A value that something else checks
stays a literal: a row before its decoder, a store driver's record before its encoder, and a
request's encoded payload. Tests may write the values they expect as literals.

Name a variable that holds a service after the service, so a call says who it calls:
`const threadStore = yield* ThreadStore.ThreadStore`,
`const threadQuery = yield* ThreadQuery.ThreadQuery`, and `(threadService) => threadService.get(id)`
for a callback given one. Effect's platform services keep the names Effect gives them, such as `sql`
and `fs`. Name a function for what it does, so a reader needn't open it: `deriveStartIds`,
`findRetriedStart`, `authorizeParticipants`, not a bare word such as `begin`, `opening`, or `load`.

## Vendored repositories

`repos/` contains upstream Git subtrees for reference. Treat their contents as
read-only unless explicitly asked to update them. Their own build commands and
contributor instructions apply to upstream development, not this application.

Import application code from installed packages such as `effect` and
`@effect/platform-bun`, never from `repos/`. Keep vendored repositories out of
application type-checking, test discovery, formatting, and linting. When adding
those tools, scope them to application files.
