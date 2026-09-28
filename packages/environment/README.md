# Environment

`@amends/environment` composes a [harness](../harness/README.md) with a
[sandbox](../sandbox/README.md) into a running environment, as the
[core model](../../docs/core-model.md#agreed-spawning-history-setup-and-input-submission-are-separate-stages)
describes: it spawns the runtime, passes history and input through to the harness, reports what it
acquired, takes snapshots, and applies retention when released. Nothing spawns an environment
outside its tests yet; turns will.

## Definitions and running environments

An `Environment.Definition<R>` is a reusable composition: an `id`, a harness, and optionally a
sandbox with its provider, acquisition options, setup commands, and retention. Without a sandbox,
execution runs in process. `R` is what the harness's sessions need, such as the `LanguageModel`
amends's own harness uses, which whoever spawns supplies. Definitions are values in code; how they
are stored in a workspace is not designed yet.

`Environment.spawn(definition, options)` returns an `Environment.Running`, whose `reference`
identifies it for acquiring again, as a turn records its `environmentId`: the definition and, with
a sandbox, the sandbox's ID. A reference names what was asked for, not proof that it survived.

## Spawning

Spawning receives no conversation history or work to do, only what the runtime needs:

1. With a sandbox, acquire it: the one `reacquire` names if it still exists, otherwise a new one,
   restored from `restore` when given. Restoring into a definition without a sandbox is
   `SnapshotUnavailable`.
2. Run the definition's setup commands in order. One that exits nonzero fails the spawn with
   `SetupFailed`, carrying its output; a sandbox the spawn created is destroyed, and one it
   reacquired is stopped.
3. Start a harness session with the given session ID, instructions, and tools.

`acquisition` reports the filesystem and the harness's context apart, as the core model requires:
the filesystem is `None` without a sandbox, `Retained`, `Restored` with the snapshot it came from,
or `Fresh`. The harness is always `needs-setup`: every spawn starts a new session, so the turn sets
up history in every case. A reference from another definition is `ForeignReference`.

## Using a running environment

`prepare`, `submit`, `resolve`, and `resume` are the harness session's own operations, passed
through. `events` reports, in order: `Ready` with the reference and acquisition; each harness event
unchanged inside a `Harness` envelope; `SnapshotTaken` when `snapshot` captures the sandbox's
files, whose place among the harness events is the history position it belongs to; and `Released`.
It fails when the harness stops. `snapshot` without a sandbox is `Unsupported`.

`release` ends the harness session and applies the definition's retention: `stop` keeps the
sandbox's files for acquiring again, and `destroy` deletes the sandbox. Afterwards the operations
fail with `Released`. If the provider fails, release reports it and a later release retries what
remains. Closing the scope that spawned it ends the harness session but leaves the sandbox as it
is, so recovery can acquire it again.

## Provisional and open

These are implementation choices where the core model leaves the contract open:

- Retention is only `stop` or `destroy`. Keeping a runtime running for reuse is not supported,
  so no harness context is ever retained.
- Setup runs on every spawn, including onto a retained or restored filesystem, so its commands
  must be safe to repeat.
- The lifecycle events are `Ready`, `SnapshotTaken`, and `Released`; a setup failure is the spawn's
  error rather than an event. The environment reports no sandbox events.

Not implemented, because what they depend on does not exist yet: configuring the harness with the
amends MCP endpoint and a turn's credentials, validating the agent's model access and settings
against the harness and connection, compatibility checks between agents and environments, and a
way for a harness that runs inside the sandbox to reach it.
