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

## Models

A `ModelEndpoint` is how an agent reaches a model: its provider and the provider's id for it, as
models.dev names them, the protocol it is served through (Anthropic's Messages API, OpenAI's
Responses API, or Chat Completions), the base URL that the protocol's paths follow, the key a
request presents, and how hard it reasons and how much it may write. A host makes an endpoint for
each model an agent may use, as from the catalog in [`@amends/connection-v2`](../connection-v2).

Every agent is made with `Agent.Options`: the endpoint a turn runs on when it names none, and the
endpoints a turn can name, by name. An adapter's own options extend them with what only its agent
takes, such as the port opencode's bridge listens on. amends's own agent makes an Effect AI language
model of each endpoint with `Models.LanguageModels`, which `Models.layer` provides over the host's
`HttpClient`; opencode's adapter configures opencode with them.

## Sessions

A `Session.Session` is what callers hold. `stream` runs a turn, `generate` returns it whole as a
`GenerateResult`, and `generateObject` decodes its answer in JSON with a schema. A turn's
`toolkit` gives the agent the host's tools: when the agent calls one, the session runs its handler
on the host and gives the agent the result. A tool with `needsApproval` is asked about first: the
turn streams a `tool-approval-request` after the call and waits, while the agent waits for the
result, until `approve` allows the call or refuses it, which answers the agent `execution-denied`.
`generate` and `generateObject` return only when the turn ends, so they refuse every request.
`approve` also passes on the requests an agent makes for its own tools, and `compact` asks the
agent to summarize the conversation so far.

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
WebSocket, at the version `Bridge.protocolVersion` names, which `Hello` answers. A host asks a
bridge that speaks an older version to `Exit`, aborting its turns, and launches its own in its
place; it refuses a bridge that speaks a newer one. Every version keeps `Hello` and `Exit` as they
are.

- `Bridge.Agent` is what an adapter implements to run behind a bridge. It starts sessions and runs
  their turns, but needs neither to suspend nor to continue one: the bridge keeps the turns.
- `BridgeServer.serve` serves an agent over the HTTP server a bridge program provides, until a host
  asks the bridge to exit, with the token and state directory from the `Bridge.LaunchOptions` that
  `BridgeServer.readLaunchOptions` reads from standard input. Each turn's parts go to a file in the state directory as well as to
  memory, and a session keeps only its latest turn. A bridge started again serves a turn that had
  finished or failed before it exited. One it aborted, as when it exited or died during the turn,
  it continues when a host starts it again: the turn keeps the steps it finished, and the bridge
  prompts the agent with `Continue.`, as AI SDK's harness does, if the agent kept the conversation
  that holds the turn. Otherwise the host runs the turn again from its prompt.
- `BridgeClient.make` is the `Agent.Agent` hosts run. A session connects to the bridge at the
  sandbox's endpoint for the port, and launches it with the adapter's command when none answers,
  giving it the launch options on standard input. It runs the template first, which installs only
  what the sandbox lacks, so that a sandbox prepared with another version of it launches this one. The token comes from the host's `token`
  function, derived from the sandbox's id with a secret every host shares, so that any host
  connects to a bridge any of them launched. Each connection starts the session in the bridge from
  the state the bridge last gave, so that a bridge that died and was launched again has it again.
  `continue` starts the turn again, which the bridge continues if it did not finish it, but a turn
  the bridge loses while a stream reads it fails with `NoTurnError`. A connection that drops is not opened again: requests
  it dropped are sent again over another, for up to 30 seconds, except a tool's result, an
  approval, and a request to compact, which the bridge must not receive twice. A turn is
  `StartTurn`, under an id the host picks, and `ReadTurn`, which reads on from the last part read.
  A session closes its connection when it lets go, or once it has gone unused for a minute. One
  whose bridge cannot answer, as when its sandbox is gone, lets go with the state it last gave.

opencode's adapter, in [`adapters/harness-opencode`](../../adapters/harness-opencode), is a bridge
program, a template that installs it, and a `make` over `BridgeClient`.

## Host tools through a relay

An agent in a sandbox can use the host's tools only through something it can call there.
`HostToolRelay` is that, for any agent that is an MCP client over HTTP: an MCP server, on the
loopback of the sandbox it runs in, that lists the tools of a session's running turn and turns each
call into a `tool-call` part of that turn. The host runs the tool as it runs any host tool, with its
approval if the tool needs one, and `submitToolResult` gives the agent's call its answer. The tools'
handlers never leave the host, so no credential reaches the sandbox: the agent holds only the token
of its session, which lets it ask the host to run that session's tools, and the host's toolkit and
approvals still decide.

- `HostToolRelay.make` is the relay without a transport. `open` starts a session, which has a token of
  its own, until its scope closes, and `answer` takes an MCP message with the `Authorization`
  header it came with. A session's `offerTools` lists the tools of a turn, for as long as the
  turn's scope lasts, and returns the stream of the calls the agent makes. The tools stay listed
  after the turn, so that an agent that read them once keeps them, but a call between turns fails.
  `HostToolRelay.layer` serves the relay on the `HttpServer` a program provides, at
  `http://127.0.0.1:<port>/mcp`, and is what a bridge program uses.
- It speaks the part of MCP that tools need, in the versions 2025-11-25, 2025-06-18, 2025-03-26, and
  2024-11-05 over Streamable HTTP: `initialize`, `ping`, `tools/list`, `tools/call`, and
  cancellation. It lists no resources or prompts, and sends no notification of its own except
  progress. A call is answered with an event stream. Because the host may wait on a person, the
  relay sends progress notifications every ten seconds while it waits, if the agent asked for them
  with a `progressToken`, which an agent with a time limit for a request takes as a sign of life. It
  gives up on a call the host has not answered in an hour.
- A result the model reads is a text as it is, a failure by its message, a refusal by its reason,
  and anything else as JSON. A call that the agent cancels, or that the end of the turn ends, fails
  with that said.
- An agent that adds to the names of the tools it is given, as opencode prefixes `host_`, leaves a
  model API's 64 characters too few: its `maxToolNameLength` says how many it takes, for the host to
  name its tools to fit.

No agent uses the relay yet. opencode's adapter would, but the runner behind opencode's `/api/session`
(1.18.23) shows its model only the tools registered in its own process, and not those of MCP servers, so the
adapter refuses a turn with host tools. The relay was run against opencode's older session API, where the
model called a host tool through it and answered with the result the host gave. The relay's server must
not close idle connections: Bun's does after ten seconds, unless it is made with `idleTimeout: 0`.

## Testing

`test/harness.test.ts` and `test/session.test.ts` run sessions over fake agents from
`test/fakes.ts`, and `test/bridge-server.test.ts` runs the bridge's handlers without a transport,
over a fake `Bridge.Agent` and a file system in memory. `test/relay.test.ts` runs the relay without
a transport, with the test clock for its progress and its time limit; its HTTP server is tested in
the opencode adapter. The bridge over a real WebSocket, launched
in a local sandbox, is tested in the opencode adapter. Run them with `bun run test packages/harness-v2`.
