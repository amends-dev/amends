# Sandbox

`@amends/sandbox` is the contract every sandbox provider implements, whether it runs commands in
a local directory or in a hosted service such as Daytona, E2B, Vercel, or Cloudflare. It knows
nothing about harnesses: an environment starts whatever runs inside, such as a harness process,
and reaches it through this contract. Nothing composes a sandbox with a harness yet.

## What every provider does

`Sandbox.Provider` names the provider, declares its `Capabilities`, and `acquire`s sandboxes.
A sandbox outlives the process that acquired it, so whoever acquires one stops or destroys it.
`acquire` takes:

| Option     | Meaning                                                                            |
| ---------- | ---------------------------------------------------------------------------------- |
| `id`       | A sandbox to acquire again.                                                        |
| `snapshot` | Captured state for a new sandbox to start from, when `id` is absent or gone.       |
| `template` | A provider-specific starting point for a new sandbox: an image, template, or name. |
| `env`      | Environment variables every command in a new sandbox receives.                     |
| `labels`   | Labels the provider shows beside the sandbox.                                      |

Acquisition is best effort. It reports whether the sandbox's files were `retained` from the
sandbox asked for, `restored` from a snapshot, or `fresh`, as the
[core model](../../docs/core-model.md#best-effort-acquisition-reports-missing-state-explicitly)
requires: a caller that needs earlier files checks the outcome rather than assuming them.

A `Sandbox.Running` sandbox has a stable `id` and an absolute `workdir`, against which relative
paths and directories resolve:

- `exec` runs a command, given as arguments rather than a shell string, to completion. A nonzero
  exit is a result with its code and each output stream, not an error.
- `spawn` starts a command in the background. Its `output` streams everything from the start for
  one consumer, `exit` waits for its code, and `kill` ends it. A signal's exit is reported as
  shells do, 128 plus the signal's number.
- `expose(port)` returns a URL and the headers that reach a port inside. The URL may be public, so
  what listens there checks its own credentials.
- `readFile` and `writeFile` move bytes, creating directories as needed; a missing file is
  `FileNotFound`.
- `snapshot` captures the filesystem, and the provider's `deleteSnapshot` removes a capture.
  Only the provider that took a snapshot restores it.
- `stop` ends its processes and keeps its files; `destroy` deletes it.

## Capabilities

Providers differ, so the rest is declared rather than assumed:

| Capability  | Meaning                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `stdin`     | A running process's standard input can be written with `write`; otherwise it is `Unsupported`. |
| `snapshots` | `none`, `filesystem`, or `filesystem-and-memory`; without them `snapshot` is `Unsupported`.    |
| `isolated`  | Work inside cannot reach the host's files, processes, or network beyond what is exposed.       |

Writing to a process's input is a capability because Vercel and Cloudflare offer none. Starting a
process and exposing a port work everywhere, so anything the host must talk to inside a sandbox
should listen on a port rather than rely on standard input.

## Declarations

`SandboxImplementation.Declaration` is what a host registers in its catalog and an environment
names: the provider's `id`, `name`, `description`, and `capabilities`; whether its sandboxes run
under an `account`, a workspace connection whose implementation declares the sandbox capability
for this provider; and, if it takes a starting point for new sandboxes, how to describe that
`template`.

## Errors

`ProviderFailure` says the provider could not do what was asked and whether retrying unchanged can
succeed. `Unsupported`, `FileNotFound`, and `SnapshotUnavailable` are the specific outcomes above.

Each provider runs the [conformance suites](../sandbox-conformance/README.md) against itself.
