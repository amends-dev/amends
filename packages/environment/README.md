# Environment

`@amends/environment` runs the environments a workspace stores: it finds the
[harness](../harness/README.md) and [sandbox](../sandbox/README.md) provider a host installed,
spawns the runtime, starts harness sessions in it with the turn's model access, and applies
retention when released, as the
[core model](../../docs/core-model.md#agreed-spawning-history-setup-and-input-submission-are-separate-stages)
describes. [Turn execution](../cluster/README.md#running-a-turn) spawns one for each run of a
turn and starts a session in it for each attempt. [Harnesses in sandboxes](../../docs/sandbox-harnesses.md)
plans how harnesses come to run inside a sandbox.

## The service

`Environment.layer({ harnesses, sandboxes, harnessServer })` provides `Environment.Service` from the
code a host installs: the harnesses it runs in process, each found by the ID its declaration gives,
whose sessions use the Effect AI model a connection supplies (`ModelInference.Services`); its
sandbox providers, each found by name; and the [harness server](#the-harness-server) it uploads to
run harnesses inside sandboxes. A host lists the harnesses' declarations in its catalog from the
same code, so what a workspace can choose and what runs agree.

`spawn(definition, options)` takes an environment as a workspace stores it, an
`Environment.Definition`: its `id`, its `harnessId`, and its sandbox, if any, with the provider,
where the harness runs (`in-process` or `in-sandbox`), template, variables, setup commands, and
retention. Core's environment records fit it as they are.

## Spawning

Spawning receives no conversation history or work to do, only what the runtime needs:

1. Find the harness and, with a sandbox, its provider. One this host did not install fails the spawn
   with `HarnessUnavailable` or `SandboxUnavailable`; a harness that runs inside the sandbox must be
   one the harness server runs.
2. With a sandbox, acquire it: the one `reacquire` names if it still exists, otherwise a new one,
   restored from `restore` when given. Restoring into a definition without a sandbox is
   `SnapshotUnavailable`, and a reference from another definition is `ForeignReference`.
3. Run the definition's setup commands in order, each with `sh -c`. One that exits nonzero fails
   the spawn with `SetupFailed`, carrying its output.
4. When the harness runs inside the sandbox, upload the harness server built for the sandbox's
   system, unless that version is already there. A system it is not built for fails the spawn with
   `UnsupportedPlatform`.

A spawn that fails after acquiring destroys a sandbox it created and stops one it reacquired.

The `Environment.Running` it returns has a `reference`, which identifies it for acquiring again: the
definition and, with a sandbox, the sandbox's ID. A reference names what was asked for, not proof that
it survived. `filesystem` says where its files came from, as the core model requires: `None` without a
sandbox, `Retained`, `Restored` with the snapshot it came from, or `Fresh`. The turn records both in
its log, and a later run of the turn spawns with that reference to acquire the same sandbox.

## Sessions and release

`startSession(options)` starts a harness session with the turn's model access: the connection's model
code, its access, and the selected model, from which Effect AI's services for the session are built.
It gives the session an ID of its own, the agent's instructions, and the context limit and
measurement the turn computed. The session lives until the caller's scope closes, and the turn talks
to it directly: `prepare`, `submit`, `resolve`, `resume`, and `events` are the
[harness contract](../harness/README.md#sessions) itself, wherever the harness runs. Inside the
sandbox, starting a session starts a process of the harness server; one that cannot start fails
with `ExecutionFailed`, as `ended`.

`snapshot` captures the sandbox's files; without a sandbox it is `Unsupported`. `release` applies the
definition's retention once the turn is done: `stop` keeps the sandbox's files for acquiring again,
and `destroy` deletes the sandbox. Repeating it after it succeeded does nothing, and after a failure
retries. A run cut short never releases, so the sandbox stays as it is for the next run to acquire.

## The harness server

The harness server is the program that runs a harness inside a sandbox, and `HarnessServer` holds
both sides of its protocol: the harness contract's session as Effect RPC requests (`Rpcs`), carried
as newline-delimited JSON over the process's standard input and output. Each process serves one
session. `Start` names the harness and carries the session's options and the turn's model access,
with the connection's implementation ID so the server finds that connection's model code; then
`Prepare`, `Submit`, `Resolve`, `Resume`, and the `Events` stream follow the contract one to one.

- `HarnessServer.layer(served)` is the server, for the program a host builds: the harnesses and
  model code it runs, over `Stdio`. It stops when its input ends. A `Start` for a harness or model
  code it lacks fails with `ExecutionFailed`, not worth retrying.
- `HarnessServer.startSession(process, options)` is the client, over a sandbox process running the
  server: it starts the session and returns it as a `Harness.Session`. A request the server cannot
  answer, because it or its process ended, fails as `ExecutionFailed` with problem `ended`, worth
  retrying. Closing the scope kills the process.
- `HarnessServer.Program` is what a host installs: the harnesses its build runs, and its build for a
  platform, such as `linux-x64`, versioned by its contents. `upload` probes the sandbox's system
  and temporary directory, and writes the build under `amends-harness-server/<version>` there
  unless it is present, renaming it into place so a sandbox never runs a partial write.

[`hosts/harness-server`](../../hosts/harness-server/README.md) is the program amends builds.

## Provisional and open

These are implementation choices where the core model leaves the contract open:

- Retention is only `stop` or `destroy`. Keeping a runtime running for reuse is not supported, so no
  harness context is ever retained, and every session prepares its history from the transcript.
- Setup runs on every spawn, including onto a retained or restored filesystem, so its commands must
  be safe to repeat.
- A sandbox provider is installed as one provider, not per account, so providers that run under a
  workspace's account, such as Daytona, are not installed yet.

- The harness server talks over its process's standard input and output, so a session ends with
  the host that started it; a later attempt starts a new one from the transcript.
- The model connection's key reaches the sandbox in the session's `Start` request.

Not implemented, because what they depend on does not exist yet: reconnecting to a harness server,
configuring the harness with the amends MCP endpoint and a turn's credentials, and environment
transfer.
