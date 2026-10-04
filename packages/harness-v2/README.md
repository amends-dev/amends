# Harness v2

A harness runs an agent, such as opencode, Codex, Claude Code, or a loop of our own over an Effect
AI `LanguageModel`, and streams every agent's turns in one format, so callers do not depend on which
agent works for them. It is to agents what Effect AI is to model providers, and is modelled on AI
SDK's harnesses. The package depends only on Effect and on [`@amends/sandbox-v2`](../sandbox-v2),
the sandboxes agents work in.

## Agents and harnesses

An agent's adapter implements `Agent.Agent`: its id, the `template` that installs it in a sandbox,
the `ports` it listens on there, whether it `requiresSandbox`, and `start`, which starts or takes
up an `AgentSession`. An agent session streams each turn as `StreamPart`s until its `finish` part,
and interrupting the stream aborts the turn. `suspend`, `detach`, and `stop` return the agent's own
state as JSON, which `start` takes back.

`Harness.make` turns an agent into the `Harness` service, as `LanguageModel.make` turns a provider
into a language model, and `Harness.layer` provides it. `startSession` starts a session and
`resumeSession` picks one up from what it last saved, on this agent or another. The caller creates
the sandbox, from the harness's `template` and with its `ports`, and owns it: a harness never stops
or destroys one. Each session works in its own directory there, named by its id, so that its files
stay in place when it moves from one agent to another.

## Sessions

A `Session.Session` is what callers hold. `stream` runs a turn, `generate` returns it whole as a
`GenerateResult`, and `generateObject` decodes its answer in JSON with a schema. A turn's
`toolkit` gives the agent the host's tools: when the agent calls one, the session runs its handler
on the host and gives the agent the result. `approve` answers a `tool-approval-request`, and
`compact` asks the agent to summarize the conversation so far.

`suspend`, `detach`, and `stop` return a `SessionState` for the caller to store, as JSON with
`Schema.toCodecJson(Session.SessionState)`. It records the conversation as Effect AI `Prompt`
messages, each step's tool calls and results included, beside the agent's own state. The agent
that last ran the session resumes from its own state; any other loads the conversation. `suspend`
ends the running turn's stream while the agent goes on with it, and `continue` finishes it after
`resumeSession`, from the step that was in flight; another agent runs it again from its prompt.
`detach` lets go between turns, `stop` stops the agent to start it again later, and `destroy`
stops it for good.

`StreamPart` holds the parts an Effect AI provider streams, in their encoded form, and three that
only agents produce: `finish-step`, `file-change`, and `compaction`. Tool calls and results keep
their params and results as JSON, since an agent runs tools of its own that no toolkit declares.
A failure the agent reports arrives as an `error` part; the operations themselves fail with
`HarnessError`, which names the agent and holds a reason such as `UnsupportedError` or
`UnavailableError`.

## Bridges

An agent that works in a sandbox is reached only through a bridge there: a program that is all the
sandbox exposes of the agent. One bridge runs for an agent in each sandbox and serves every
session in it, on the agent's port, to hosts that present its token as `Authorization: Bearer`. It
runs each turn itself, so that a turn goes on when a host's connection drops or the host lets go,
and numbers and keeps the turn's parts, so that a host reads them from any number: after
reconnecting, or to `continue` a turn another host suspended. `Bridge.Rpcs` is the protocol, over a
WebSocket.

- `Bridge.Agent` is what an adapter implements to run behind a bridge. It starts sessions and runs
  their turns, but needs neither to suspend nor to continue one: the bridge keeps the turns.
- `BridgeServer.layer` serves an agent over the HTTP server a bridge program provides, with the
  token and state directory from the `Bridge.LaunchOptions` that `BridgeServer.readLaunchOptions`
  reads from standard input. Each turn's parts go to a file in the state directory as well as to
  memory, and a session keeps only its latest turn. A bridge started again serves a turn that had
  finished or failed before it exited; a host runs again one that had not.
- `BridgeClient.make` is the `Agent.Agent` hosts run. A session connects to the bridge at the
  sandbox's endpoint for the port, and launches it with the adapter's command when none answers,
  giving it the launch options on standard input. The token comes from the host's `token`
  function, derived from the sandbox's id with a secret every host shares, so that any host
  connects to a bridge any of them launched. Each connection starts the session in the bridge from
  the state the bridge last gave, so that a bridge that died and was launched again has it again; a
  turn the bridge was running then is lost. A connection that drops is not opened again: requests
  it dropped are sent again over another, for up to 30 seconds, except a tool's result, an
  approval, and a request to compact, which the bridge must not receive twice. A turn is
  `StartTurn`, under an id the host picks, and `ReadTurn`, which reads on from the last part read.
  A session closes its connection when it lets go, or once it has gone unused for a minute. One
  whose bridge cannot answer, as when its sandbox is gone, lets go with the state it last gave.

opencode's adapter, in [`adapters/harness-opencode`](../../adapters/harness-opencode), is a bridge
program, a template that installs it, and a `make` over `BridgeClient`.

## Testing

`test/harness.test.ts` and `test/session.test.ts` run sessions over fake agents from
`test/fakes.ts`, and `test/bridge-server.test.ts` runs the bridge's handlers without a transport,
over a fake `Bridge.Agent` and a file system in memory. The bridge over a real WebSocket, launched
in a local sandbox, is tested in the opencode adapter. Run them with `bun run test packages/harness-v2`.
