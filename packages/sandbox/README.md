# @amends/sandbox

Sandboxes that agents work in. A sandbox is an isolated machine that code runs in: its files and
processes are Effect's own `FileSystem` and `ChildProcessSpawner`, so any Effect code that uses
them runs inside the sandbox once `Sandbox.layerServices` provides them. The `Sandbox` service
adds what Effect has no service for: the sandbox's identity, its ports, its network, and its
lifecycle. A `SandboxProvider` creates sandboxes on one platform, such as this machine or Daytona,
and resumes the ones it created before, so code that creates sandboxes does not depend on which.
The package depends only on Effect.

## Install

```sh
bun add @amends/sandbox effect
```

Add a provider for each platform you run sandboxes on, such as `@amends/sandbox-local` for this
machine or `@amends/sandbox-daytona`. [`@amends/harness`](../harness) runs agents in them.

## The modules

| Module            | What it holds                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `Sandbox`         | The sandbox: its files, processes, ports, network policy, and lifecycle, and `layerServices`.   |
| `SandboxProvider` | Creates sandboxes on one platform, from a template, and resumes them by id.                     |
| `Template`        | Prepares a new sandbox, as by installing an agent, once per version where a provider snapshots. |
| `Network`         | Ports and how to reach them, the outbound network policy, and request transformations.          |
| `SandboxError`    | The error every operation on a sandbox fails with, and its reasons.                             |

A sandbox outlives the process that created it: it runs until `stop` or `destroy`, and a provider
resumes it later by its id. A process in it ends with the scope that spawned it, unless its handle's
`unref` lets it outlive that scope, as a server that keeps running after the host lets go does.

## Writing a provider

A provider implements `SandboxProvider`, and runs the conformance suites in `@amends/sandbox/conformance`
against itself, so that code written against the contract works the same on each: its tests call
`run` with a `Fixture` that makes the provider and gives what the suites cannot assume of every
platform. The suites need `@effect/vitest`, an optional peer dependency that only a provider's
tests install. [`@amends/sandbox-local`](../../adapters/sandbox-local) and
[`@amends/sandbox-daytona`](../../adapters/sandbox-daytona) are the providers in this repository.

## Development

Run the package's tests with `bun run test packages/sandbox`; each provider runs the conformance
suites in its own tests. See [testing](../../docs/testing.md), and
[publishing](../../docs/publishing.md) for `bun run dist check packages/sandbox`.
