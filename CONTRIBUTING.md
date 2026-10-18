# Contributing to amends

Thank you for helping. amends is in early development, and nothing in it is stable yet: a change
may break any interface when that makes the structure clearer, as long as it updates everything
that uses it in the same change. This guide covers setting up, the checks every change passes, and
how changes are made.

Report a vulnerability as [SECURITY.md](SECURITY.md) describes, not in a public issue.

## Set up

You need:

- [Bun](https://bun.com) 1.3.14, the version CI uses.
- PostgreSQL, with `initdb` and `pg_ctl` on your `PATH`: the PostgreSQL tests start a temporary
  server of their own, or use the server at `AMENDS_POSTGRES_URL` when it is set.

Then, from the repository root:

```sh
bun install
```

Installing also patches the local TypeScript compiler with Effect's diagnostics and installs the
Git hooks, through the root manifest's `prepare` script. The [README](README.md#run-it-locally)
shows how to run the app.

In VS Code, the workspace settings select the repository's TypeScript and format on save with Oxc.
Install the recommended Oxc and Effect extensions, and pick the workspace TypeScript version when
asked.

## Before you change code

[AGENTS.md](AGENTS.md) is the project's guidance, for people and coding agents alike: the
workspace layout, which package may depend on which, how code is named and structured, and how it
is reviewed. Each directory's README adds its own conventions: [packages](packages/README.md),
[adapters](adapters/README.md), [hosts](hosts/README.md), and [apps](apps/README.md).

amends is written with [Effect](https://effect.website) 4. Read
[Effect's guide for this source](repos/effect/LLMS.md) before writing Effect code, and check the
APIs you use against the vendored source in `repos/effect`, which matches the installed version.
Import from the installed packages, never from `repos/`.

## Checks

| Command                  | What it does                                                                    |
| ------------------------ | ------------------------------------------------------------------------------- |
| `bun run check`          | Dependency boundaries, generated barrels and icons, types, lint, and formatting |
| `bun run test`           | Every test suite: backend, PostgreSQL, and the frontend workspaces              |
| `bun run test <path>`    | The tests under one path, such as `bun run test packages/harness`               |
| `bun run format`         | Format files with Oxfmt                                                         |
| `bun run lint:fix`       | Apply Oxlint's safe fixes                                                       |
| `bun run typecheck`      | TypeScript 7 with Effect's diagnostics, across every workspace                  |
| `bun run check:packages` | Which package may depend on which                                               |
| `bun run barrels`        | Write every barrel, each `index.ts` marked `// @barrel`, from its folder        |
| `bun run dist`           | Build or check a package as npm gets it                                         |
| `bun changeset`          | Describe a change to published packages for their next release                  |

Run `bun run check` after every change and the tests after any change in behavior.

Before each commit, [Lefthook](https://lefthook.dev) runs the dependency, generated-barrel,
generated-icon, type, lint, and formatting checks in parallel over the working tree. They change and stage nothing; a
failing check blocks the commit. Run them by hand, even with nothing staged, with:

```sh
bun run lefthook run pre-commit --force
```

The hook does not run tests, so run the suites of the packages you touched before committing. CI
runs the checks, the tests, and the frontend builds on every pull request.

A change to the host's runtime setup needs more: start the host on a temporary database and
confirm it listens, as the [local host guide](hosts/local/README.md#verify) describes.

## Making a change

1. Branch from `main`, and keep one concern per pull request.
2. Update every consumer of what you change, and the READMEs that describe it.
3. When a published package's users would see the change, add a changeset with `bun changeset`:
   a patch for a fix, and a minor for a feature or, before 1.0, a breaking change, which moves
   every published package to the next line.
4. Write commits that each say, in one sentence, what changed and why: "Move the channel transport
   contract into its own package, as the harness and sandbox contracts are." Explain the reason
   in the body when it needs more than the subject.
5. Open a pull request that says what changed, why, and how you verified it.

Code is reviewed by how a newcomer reads it, as AGENTS.md's
[design and review](AGENTS.md#design-and-review) section describes: one word per concept, no layer
that only forwards, flows that read top to bottom, and names that say what things do.

## Adding an integration

An integration connects amends to another system: an agent, a sandbox provider, a channel, a
model provider, or a tool source. Each kind has a contract, and each implementation lives in its
own package under `adapters/`, with the dependencies of the system it reaches:

- An agent implements the harness contract; see
  [writing an adapter](packages/harness/README.md#writing-an-adapter).
- A sandbox provider implements the sandbox contract and runs its conformance suites; see
  [writing a provider](packages/sandbox/README.md#writing-a-provider).
- A channel implements the channel transport contract; see
  [writing a transport](packages/channel/README.md#writing-a-transport).

A host then declares the integration, as the [local host](hosts/local/README.md) does for the
agents and sandbox providers it installs, through the [connection](packages/connection/README.md)
package.

## Updating Effect

The root manifest's `workspaces.catalog` pins every Effect package, and `repos/effect` holds the
matching source as a squashed Git subtree of [Effect-TS/effect](https://github.com/Effect-TS/effect),
at tag `effect@4.0.5`, commit `7f524e25cfb49a71ac39b0f44278d08d40dda5de`. Upgrade both together:

1. Set the new version for every Effect package in the catalog, and run `bun install`. The root
   manifest's `overrides` keeps `@opencode/codemode` on the catalog's Effect, so it moves with it.
2. Commit, then pull the matching tag, replacing `<version>` with the catalog's version:

   ```sh
   git subtree pull --prefix=repos/effect \
     https://github.com/Effect-TS/effect.git 'effect@<version>' --squash
   ```

3. Update the tag and commit recorded above, run `bun run check` and `bun run test`, recheck the
   APIs the upgrade touches, and verify the host starts as its
   [guide](hosts/local/README.md#verify) describes.
4. Raise the published packages to a new line with a changeset, since their `effect` range moves
   with the catalog.

The weekly [Latest Effect](.github/workflows/latest-effect.yml) workflow checks the repository
against the newest Effect release the published packages allow, and fails when one breaks them:
the sign to upgrade.

Journal payloads are encoded with `SchemaBinary`, and the
[codec fixtures](packages/core/test/journal/codec.test.ts) check bytes captured from an earlier
encoder. Keep them across upgrades: round-trip tests alone do not show that stored payloads still
decode.

`@effect/tsgo` patches TypeScript with Effect's diagnostics. Its Oxlint integration does not support
the Oxlint version pinned here, so Effect's diagnostics run through TypeScript, and stock Oxlint runs
the type-aware lint rules. Check [the versions it supports](https://github.com/Effect-TS/tsgo#supported-package-versions)
before changing either pin.

## License

By contributing, you agree that your contributions are licensed under the
[MIT license](LICENSE).
