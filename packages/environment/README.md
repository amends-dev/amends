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
sandbox implementations (`Sandbox.Implementation`), each found by the ID it declares, which make a
provider for the connection a sandbox runs under; and the [harness server](#the-harness-server) it
uploads to run harnesses inside sandboxes. A host lists the harnesses' declarations in its catalog from the
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
2. With a sandbox, make the provider with the sandbox's connection, `sandboxConnection`, for the
   caller's scope, and acquire it: the one `reacquire` names if it still exists, otherwise a new
   one, labelled `amends-environment` with the definition's ID, restored from `restore` when given. Restoring into a definition without a sandbox is
   `SnapshotUnavailable`, and a reference from another definition is `ForeignReference`.
3. Run the definition's setup commands in order, each with `sh -c`. One that exits nonzero fails
   the spawn with `SetupFailed`, carrying its output.
4. When the harness runs inside the sandbox, make sure the [harness server](#the-harness-server)
   runs there: keep the one already running, as in a sandbox acquired again, or upload the build for
   the sandbox's system and start it. A system it is not built for fails the spawn with
   `UnsupportedPlatform`, and a server that does not start fails it with `HarnessServerFailed`.

A spawn that fails after acquiring destroys a sandbox it created and stops one it reacquired.

The `Environment.Running` it returns has a `reference`, which identifies it for acquiring again: the
definition and, with a sandbox, the sandbox's ID. A reference names what was asked for, not proof that
it survived. `filesystem` says where its files came from, as the core model requires: `None` without a
sandbox, `Retained`, `Restored` with the snapshot it came from, or `Fresh`. The turn records both in
its log, and a later run of the turn spawns with that reference to acquire the same sandbox.

## Sessions and release

`startSession(options)` starts a harness session with the turn's model access: the connection's model
code, its access, and the selected model, from which Effect AI's services for the session are built.
It gives the session the ID the turn chose and recorded, the agent's instructions, and the context
limit and measurement the turn computed. The turn talks to it directly: `prepare`, `submit`,
`resolve`, `resume`, and `events` are the [harness contract](../harness/README.md#sessions) itself,
wherever the harness runs. A session in process lives until the caller's scope closes. One inside the
sandbox ends when the scope closes too, unless the scope closes because the run was cut short: then
the session goes on in the harness server, for a later run to attach to.

`attachSession({ sessionId, recorded })` is how that later run finds it: when the harness server
still holds the session, it returns the events the session reported after the `recorded` ones the
turn has, whether it is `working`, `idle`, or `stopped`, and the session, whose `events` continue
from there. A session in process, or one the server no longer holds, is `undefined`, and the turn
starts a new one from its transcript.

`snapshot` captures the sandbox's files; without a sandbox it is `Unsupported`. `release` applies the
definition's retention once the turn is done, after stopping the harness server in the sandbox:
`stop` keeps the sandbox's files for acquiring again, and `destroy` deletes the sandbox. Repeating it
after it succeeded does nothing, and after a failure retries. A run cut short never releases, so the
sandbox stays as it is for the next run to acquire. The service's own `release(definition,
reference, sandboxConnection)` does the same for a sandbox a run left without spawning it, as when
a turn ends while nothing runs it; one the provider no longer has comes back new, and is destroyed.

## The harness server

The harness server is the program that runs a harness inside a sandbox, and `HarnessServer` holds
both sides of its protocol: the harness contract's session as Effect RPC requests (`Rpcs`), carried
as newline-delimited JSON over HTTP at `/rpc`. It runs in the background, apart from the host that
started it, so a session goes on when that host stops, and holds one session at a time. `Start`
names the session, its harness, its options, and the turn's model access, with the connection's
implementation ID so the server finds that connection's model code; `Prepare`, `Submit`, `Resolve`,
`Resume`, and the `Events` stream follow the contract one to one. `Attach` reports what a session
kept, `End` ends it, and `Stop` ends it and stops the server.

The server keeps every event of its session that a turn's log keeps, all but text and reasoning
deltas, until another session replaces it, so a host that comes back reads what it missed: `Events`
takes the number of kept events to skip. It gives a batch submitted again, as by a host that is
unsure its submission arrived, once. A session that ends, however it ends, fails its listeners'
`Events` with `ExecutionFailed`, problem `ended`, and the server ends its session when it shuts
down.

- `HarnessServer.layerRoutes(served, { token, stop })` is the server's routes, for the program a
  host builds: the harnesses and model code it runs, the token every request must carry as a bearer
  token, and how it stops when asked to. A `Start` for a harness or model code it lacks fails with
  `ExecutionFailed`, not worth retrying. A session gets `HarnessServer.SessionServices`: the
  model both as Effect AI model access and as the endpoint (`ModelInference.Endpoint`) a harness
  that speaks the provider's interface calls itself, and the machine's processes and files, for a
  harness that runs a program of its own, such as opencode; the program provides those.
- `HarnessServer.startSession(endpoint, options)` and `attachSession(endpoint, session)` are the
  client, over the URL and headers that reach the server. A request the server cannot answer, or
  about a session it no longer holds, fails as `ExecutionFailed` with problem `ended`, worth
  retrying. `events` first reads again for about eight seconds when its connection drops,
  continuing after the events it delivered.
- `HarnessServer.Program` is what a host installs: the harnesses its build runs, and its build for a
  platform, such as `linux-x64`, versioned by its contents.
- `HarnessServer.ensureRunning(sandbox, program)` finds the server serving the sandbox from the
  state file it wrote, `amends-harness-server/<sandbox ID>.json` in the sandbox's temporary
  directory, holding its port, its token, and the protocol version it speaks
  (`HarnessServer.protocolVersion`). One that speaks this version and answers is kept, whichever
  build or host started it; one speaking another version is asked to stop. Otherwise it writes the
  build under `amends-harness-server/<version>` unless present, renaming it into place so a sandbox
  never runs a partial write, starts it in the background with the state file's path, and waits
  for the state file. The server reaches the host through the sandbox's exposure of its port.
- `HarnessServer.stopRunning(sandbox)` asks the server serving the sandbox to stop, for releasing
  it. A provider's stop need not end processes a host it no longer runs started, as a local
  sandbox's does not.

[`hosts/harness-server`](../../hosts/harness-server/README.md) is the program amends builds.

## Provisional and open

These are implementation choices where the core model leaves the contract open:

- Retention is only `stop` or `destroy`. Keeping a runtime running for reuse is not supported, so no
  harness context is ever retained, and every session prepares its history from the transcript.
- Setup runs on every spawn, including onto a retained or restored filesystem, so its commands must
  be safe to repeat.
- Each turn acquires a sandbox of its own, so with `stop` every turn leaves a stopped sandbox,
  which a hosted provider keeps until it deletes it, as Daytona does after its own interval.
- Each new sandbox receives the harness server, about 65 MB, which takes seconds to upload.

- The model connection's key reaches the sandbox in the session's `Start` request.
- The harness server's port is reachable wherever the sandbox exposes it; the token in its state
  file, readable by the sandbox's user only, is what keeps others out.
- A session a host left at work goes on until a host attaches or releases the sandbox. Nothing
  else ends it, so a turn no run comes back to leaves its server running until its sandbox stops.

Not implemented, because what they depend on does not exist yet: configuring the harness with the
amends MCP endpoint and a turn's credentials, and environment transfer.
