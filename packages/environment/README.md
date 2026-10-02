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

`Environment.layer({ harnesses, sandboxes })` provides `Environment.Service` from the code a host
installs: the harnesses it runs in process, each found by the ID its declaration gives, whose
sessions use the Effect AI model a connection supplies (`ModelInference.Services`), and its sandbox
providers, each found by name. A host lists the harnesses' declarations in its catalog from the same
list, so what a workspace can choose and what runs agree.

`spawn(definition, options)` takes an environment as a workspace stores it, an
`Environment.Definition`: its `id`, its `harnessId`, and its sandbox, if any, with the provider,
template, variables, setup commands, and retention. Core's environment records fit it as they are.

## Spawning

Spawning receives no conversation history or work to do, only what the runtime needs:

1. Find the harness and, with a sandbox, its provider. One this host did not install fails the spawn
   with `HarnessUnavailable` or `SandboxUnavailable`.
2. With a sandbox, acquire it: the one `reacquire` names if it still exists, otherwise a new one,
   restored from `restore` when given. Restoring into a definition without a sandbox is
   `SnapshotUnavailable`, and a reference from another definition is `ForeignReference`.
3. Run the definition's setup commands in order, each with `sh -c`. One that exits nonzero fails
   the spawn with `SetupFailed`, carrying its output; a sandbox the spawn created is destroyed, and
   one it reacquired is stopped.

The `Environment.Running` it returns has a `reference`, which identifies it for acquiring again: the
definition and, with a sandbox, the sandbox's ID. A reference names what was asked for, not proof that
it survived. `filesystem` says where its files came from, as the core model requires: `None` without a
sandbox, `Retained`, `Restored` with the snapshot it came from, or `Fresh`. The turn records both in
its log, and a later run of the turn spawns with that reference to acquire the same sandbox.

## Sessions and release

`startSession(options)` starts a harness session with the turn's model access: the connection's model
code, its access, and the selected model, from which the environment builds Effect AI's services for the
session. It gives the session an ID of its own, the agent's instructions, and the context limit and
measurement the turn computed. The session lives until the caller's scope closes, and the turn talks
to it directly: `prepare`, `submit`, `resolve`, `resume`, and `events` are the
[harness contract](../harness/README.md#sessions) itself.

`snapshot` captures the sandbox's files; without a sandbox it is `Unsupported`. `release` applies the
definition's retention once the turn is done: `stop` keeps the sandbox's files for acquiring again,
and `destroy` deletes the sandbox. Repeating it after it succeeded does nothing, and after a failure
retries. A run cut short never releases, so the sandbox stays as it is for the next run to acquire.

## Provisional and open

These are implementation choices where the core model leaves the contract open:

- Retention is only `stop` or `destroy`. Keeping a runtime running for reuse is not supported, so no
  harness context is ever retained, and every session prepares its history from the transcript.
- Setup runs on every spawn, including onto a retained or restored filesystem, so its commands must
  be safe to repeat.
- A sandbox provider is installed as one provider, not per account, so providers that run under a
  workspace's account, such as Daytona, are not installed yet.

Not implemented, because what they depend on does not exist yet: harnesses that run inside a sandbox,
configuring the harness with the amends MCP endpoint and a turn's credentials, and environment
transfer.
