# @amends/harness

Runs an agent, such as opencode, Codex, Claude Code, or one in your own process over an Effect AI
`LanguageModel`, and streams every agent's turns in one format, so your code does not depend on
which agent works for it. It is to agents what Effect AI is to model providers, and is modelled on
AI SDK's harnesses. The package depends only on Effect and on [`@amends/sandbox`](../sandbox), the
sandboxes agents work in.

## Install

```sh
bun add @amends/harness @amends/sandbox effect
```

Add an adapter for each agent you run, such as
[`@amends/harness-opencode`](../../adapters/harness-opencode) for opencode in a sandbox or
[`@amends/harness-amends`](../../adapters/harness-amends) for an agent in your own process, and a
sandbox provider, such as `@amends/sandbox-local` for this machine or `@amends/sandbox-daytona`.

## Quick start

A harness is made from an agent's adapter. The caller creates the sandbox from the agent's template
and owns it, creates a session in it, and runs turns. Releasing the session returns its state, as
JSON-encodable data, to resume it later on any host, and on any agent.

```ts
import { Agent, Harness, Session } from "@amends/harness";
import { SandboxProvider } from "@amends/sandbox";
import { Console, Effect, Schema, Stream } from "effect";

declare const agent: Agent.Agent; // from an adapter, such as @amends/harness-opencode

const SessionStateJson = Schema.fromJsonString(Schema.toCodecJson(Session.SessionState));

const program = Effect.gen(function* () {
  const harness = Harness.make(agent);
  const sandboxes = yield* SandboxProvider.SandboxProvider;
  const sandbox = yield* sandboxes.create({ template: harness.agent.template });

  const session = yield* harness.createSession({ sandbox, id: Agent.SessionId.make("review") });
  yield* session
    .stream({ prompt: "Summarize README.md" })
    .pipe(
      Stream.runForEach((part) =>
        part.type === "text-delta" ? Console.log(part.delta) : Effect.void,
      ),
    );

  // Store the session as JSON, and resume it later, on any host and any agent.
  const saved = yield* Schema.encodeEffect(SessionStateJson)(yield* session.detach);
  const resumed = yield* harness.createSession({
    sandbox,
    resumeFrom: yield* Schema.decodeEffect(SessionStateJson)(saved),
  });
  const answer = yield* resumed.generate({ prompt: "Now list its headings" });
  return answer.text;
});
```

`Harness.layer(agent)` provides the harness as a service to a program that runs one agent.

## The modules

| Module           | What it holds                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `Harness`        | The service callers run an agent through: `make` builds it from an adapter, `createSession` starts. |
| `Session`        | One conversation, run a turn at a time, and `SessionState`, what it is saved and resumed from.      |
| `StreamPart`     | The parts a turn streams, and `stepsOf`, which adds them up into `Step`s.                           |
| `GenerateResult` | A whole turn, as `generate` and `generateObject` return it.                                         |
| `ModelEndpoint`  | How an agent reaches a model.                                                                       |
| `HarnessError`   | The error every operation fails with, and its reasons.                                              |
| `Agent`          | What an adapter implements: the agent, its sessions, and the options every agent is made with.      |
| `Bridge`         | For an agent in a sandbox: the `Driver` an adapter implements there, and the protocol to the host.  |
| `BridgeServer`   | Serves a driver in the sandbox, as a bridge program does.                                           |
| `BridgeClient`   | Creates the sessions of an agent behind a bridge, as the adapter's `Agent` does on the host.        |
| `HostToolRelay`  | An MCP server in the sandbox through which an agent there calls the host's tools.                   |

## Sessions and turns

A `Session` runs one turn at a time. `stream` runs a turn as a stream of `StreamPart`s until its
`finish` part; interrupting the stream aborts the turn. `generate` returns the turn whole, as a
`GenerateResult`, whose `text` is the turn's answer, the text of its last step. `generateObject`
asks the agent to answer in JSON and decodes the answer with a schema:

```ts
import { Session } from "@amends/harness";
import { Effect, Schema } from "effect";

declare const session: Session.Session;

const Review = Schema.Struct({
  verdict: Schema.Literals(["approve", "request-changes"]),
  notes: Schema.String,
});

const review = Effect.gen(function* () {
  const result = yield* session.generateObject({ prompt: "Review the diff", schema: Review });
  return result.value; // { verdict, notes }
});
```

A failure the agent reports during a turn, such as its model rejecting a key, arrives in the stream
as an `error` part, and the turn finishes with the reason `error`; `generate` and `generateObject`
fail on it with `TurnFailedError`.

### Host tools

A turn's `toolkit` gives the agent the host's tools, an Effect AI `Toolkit` with its handlers. When
the agent calls one, the session runs its handler on the host, streams the result as a
`tool-result` part, and gives the agent the result. The agent's own tools run inside the agent, and
their calls and results stream as `providerExecuted`.

A tool with `needsApproval` is asked about first: the turn streams a `tool-approval-request` after
the call and waits, while the agent waits for the result, until `approve` allows the call or
refuses it, which answers the agent `execution-denied`.

```ts
import { Agent, Harness } from "@amends/harness";
import { Effect, Schema, Stream } from "effect";
import { Tool, Toolkit } from "effect/ai";

const Delete = Tool.make("Delete", {
  description: "Deletes a file in the workspace",
  parameters: Schema.Struct({ path: Schema.String }),
  success: Schema.String,
  needsApproval: true,
});
const Tools = Toolkit.make(Delete);

const program = Effect.gen(function* () {
  const harness = yield* Harness.Harness;
  const toolkit = yield* Tools.pipe(
    Effect.provide(Tools.toLayer({ Delete: ({ path }) => Effect.succeed(`deleted ${path}`) })),
  );
  const session = yield* harness.createSession({ id: Agent.SessionId.make("cleanup") });
  yield* session
    .stream({ prompt: "Delete the build output", toolkit })
    .pipe(
      Stream.runForEach((part) =>
        part.type === "tool-approval-request"
          ? session.approve({ approvalId: part.approvalId, approved: true })
          : Effect.void,
      ),
    );
});
```

`generate` and `generateObject` return only when the turn ends, so nothing can answer their
requests: they deny each. `approve` also passes on the requests an agent makes for its own tools.

### Compaction

`compact` asks the agent, between turns, to replace the conversation so far with a summary, and
returns the `compaction` part. An agent may also compact by itself during a turn, when the
conversation outgrows its model's context window; it streams the `compaction` between two steps.
Either way, the conversation goes on from the summary, as a user message, followed by the latest
messages the agent kept as they were.

### Releasing a session

Each of these releases the session, after which it refuses every other operation with
`SessionClosedError`. The first three return a `SessionState`.

| Operation     | What it does                                                                       |
| ------------- | ---------------------------------------------------------------------------------- |
| `suspendTurn` | Ends the running turn's stream while the agent goes on with the turn where it can. |
| `detach`      | Releases the session between turns while the agent keeps running.                  |
| `stop`        | Stops the agent, aborting a running turn, to start it again later.                 |
| `destroy`     | Stops the agent for good and deletes what it keeps of the session.                 |

`SessionState` records the conversation as Effect AI `Prompt` messages, each step's tool calls and
results included, beside the agent's own state and the unfinished turn, if any. The agent that last
ran the session resumes from its own state; any other loads the conversation, so a session moves
from one agent to another. A resumed session with an unfinished turn finishes it with
`continueStream`, from the step that was in flight; an agent that no longer has the turn, as
`hasUnfinishedTurn` says, runs it again from its prompt.

A caller that logs a turn's steps itself, rather than storing the whole conversation with every
turn, rebuilds the conversation with `Session.recordStep`, which records one `Step` as the session
does, and gives it to `createSession` as `history`. A turn that runs apart from the host, as one
behind a bridge does, starts with a `turn-start` part carrying what `suspendTurn` would return, so
that such a caller continues the turn once the host that ran it is gone, as after a crash.

### Who keeps what

| Who                    | Keeps                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------- |
| The caller             | The `SessionState` each release returns, and the parts it read of a running turn.   |
| The session            | The conversation in memory, only while the session is open.                         |
| A bridge, in a sandbox | Its sessions, and each one's latest turn as numbered parts, in its state directory. |
| The agent              | Its own conversation and files, wherever it keeps them.                             |

## Stream parts and steps

`StreamPart` holds the parts an Effect AI provider streams, in their encoded form, and four that
only agents produce: `turn-start`, `finish-step`, `file-change`, and `compaction`. Code that reads a
provider's stream reads a harness's. Tool calls and results keep their params and results as JSON,
since an agent runs tools of its own that no toolkit declares; decode them with the tool's schemas
when you need their types.

A turn takes one or more steps, each one response from the model and the tools it called, ended by
a `finish-step` part. `StreamPart.stepsOf` adds a turn's parts up into its `Step`s, each step's
texts and reasonings whole, its tool calls and final results, and how it finished. A step is JSON,
for callers that store a turn's steps.

## Models

A `ModelEndpoint` is how an agent reaches a model: the provider and the provider's id for it, as
models.dev names them, the protocol it is served through, the base URL the protocol's paths
follow, the key a request presents, and how hard it reasons and how much it may write. Every agent
is made with `Agent.Options`: the endpoint a turn runs on when it names none, and the endpoints a
turn can name, by name. An adapter extends them with what only its agent takes. An agent in the
host's process makes an Effect AI language model of each endpoint; an agent in a sandbox is
configured with them.

```ts
import { ModelEndpoint } from "@amends/harness";
import { Redacted } from "effect";

const sonnet: ModelEndpoint.ModelEndpoint = {
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  protocol: "anthropic-messages",
  url: "https://api.anthropic.com/v1",
  apiKey: Redacted.make(process.env.ANTHROPIC_API_KEY ?? ""),
  contextWindow: 200_000,
};
```

## Errors

Every operation fails with `HarnessError`, which names the agent and holds a reason:
`UnsupportedError`, `NotFoundError`, `SessionClosedError`, `TurnInProgressError`, `NoTurnError`,
`TurnFailedError`, `InvalidOutputError`, `StructuredOutputError`, `UnavailableError`, or
`UnknownError`. Each says whether trying again may succeed, as `isRetryable`, and
`Effect.catchReason("HarnessError", "UnavailableError", ...)` recovers from one reason.

## Writing an adapter

### An agent in the host's process

Implement `Agent.Agent`: the agent's `id`, whether it `requiresSandbox`, the `template` that
installs it in one, and `createSession`, which starts an `AgentSession`, a new one or one picked
up from what an earlier session returned. A session runs each turn with `promptTurn`, streaming
`StreamPart`s until its `finish` part. `suspendTurn`, `detach`, and `stop` return the agent's own
state as JSON, which `createSession` takes back; `continueTurn` finishes a turn `suspendTurn` cut
short, given how many steps the harness already has. The harness runs one turn at a time and
releases the session once, so an agent never sees a turn start while another runs.

`@amends/harness-amends` is such an agent: a loop over an Effect AI `LanguageModel`, with the
tools in the sandbox given as an Effect AI toolkit.

### An agent in a sandbox, behind a bridge

An agent that works in a sandbox is reached only through a bridge there: a program that is all the
sandbox exposes of the agent, on a port of its own, to hosts that present its token as
`Authorization: Bearer`. The adapter brings three things.

1. A `Bridge.Driver`, which runs in the sandbox and drives the agent there: it starts the agent's
   sessions and runs their turns, but needs neither to suspend nor to continue one, since the
   bridge keeps the turns.
2. A bridge program, which reads its `Bridge.LaunchOptions` from standard input with
   `BridgeServer.readLaunchOptions`, makes the driver from the agent options among them, and serves
   it with `BridgeServer.serve` over the HTTP server the program provides.
3. On the host, an `Agent.Agent` that requires a sandbox and whose `createSession` is
   `BridgeClient.createSession`, with `BridgeClient.Options` saying how to install and launch the
   bridge, and how to derive its token from a sandbox's id.

Each module's documentation shows one. [`@amends/harness-opencode`](../../adapters/harness-opencode)
is a complete adapter: its template installs opencode and the bridge program, and its driver runs
opencode's server on the sandbox's loopback.

How bridges run:

- A bridge is named by its `Bridge.BridgeId`, a digest of everything a host launches it with, the
  protocol's version and the sandbox's token included, and serves every session that hosts start
  with those settings. Hosts that launch a bridge alike share it; a host with other settings, such
  as another model or key, runs its own beside it.
- A bridge listens on a port the sandbox picks and writes it to `Bridge.listeningFile` in its state
  directory, `.bridge/<agent>/<bridge id>` in the sandbox's working directory, where hosts find it.
  A session exposes the port and connects at the sandbox's endpoint for it; it launches the bridge
  when none answers there as that bridge, after running the template, which installs only what
  the sandbox lacks.
- The bridge runs each turn itself, so that a turn goes on when a host's connection drops or the
  host releases the session, and numbers and keeps the turn's parts, in memory and in a file, so
  that a host reads them from any number: after reconnecting, or to continue a turn another host
  suspended. A session keeps only its latest turn.
- A bridge exits once it runs no turn and no host has started a session or a turn for ten minutes,
  or once the listening file names another bridge of its id, as when two hosts launched one at
  once. A bridge started again serves a turn that ended before it exited from the turn's file, and
  continues one it aborted, as when it exited or died during the turn, by prompting the agent with
  `Continue.`, as AI SDK's harness does, if the agent kept the conversation that holds the turn.
- On the host, a session connects while it uses the bridge and closes the connection when it
  releases the session, or after a minute unused. A connection that drops is not opened again:
  requests it dropped are sent again over another, for up to 30 seconds, except a tool's result, an
  approval, and a request to compact, which the bridge must not receive twice. `suspendTurn` keeps
  which bridge runs the turn, so that `continueTurn` starts it again there, even from a host with
  other settings, which goes on in its own bridge once the turn ends. A session whose bridge cannot
  answer, as when its sandbox is gone, releases with the state the bridge last gave.

Only data crosses into the sandbox: a turn's tools go as `Bridge.ToolDefinition`s, their
parameters as JSON Schemas, and the schema of a JSON answer the same way. The launch options,
with the token and the agent's credentials, go on the bridge's standard input, where nothing else
in the sandbox reads them.

### Host tools through the relay

An agent in a sandbox can use the host's tools only through something it can call there.
`HostToolRelay` is that, for any agent that is an MCP client over HTTP: an MCP server on the
sandbox's loopback that lists the tools of a session's running turn and turns each call into a
`tool-call` part of that turn. The host runs the tool as it runs any host tool, with its approval
if the tool needs one, and `submitToolResult` gives the agent's call its answer. The tools'
handlers never leave the host, so no credential reaches the sandbox: the agent holds only the token
of its session, which lets it ask the host to run that session's tools.

A bridge program serves the relay with `HostToolRelay.layer` beside its bridge, and its driver
gives each session the relay's `url` and the session's token as the agent's MCP server. In
`promptTurn`, the driver offers the turn's tools with `offerTools` and merges the calls it returns
into the turn's stream; the driver's `submitToolResult` is the relay session's. The documentation
of `HostToolRelay` shows the driver. The relay speaks the part of MCP that tools need, in the
versions 2025-11-25 to 2024-11-05 over Streamable HTTP, answers a call with an event stream, and
keeps a call that waits on the host alive with progress notifications every ten seconds, for an
agent with a time limit for a request, until it gives up after an hour. The relay's server must not
close idle connections: Bun's does after ten seconds, unless it is made with `idleTimeout: 0`.

No adapter in this repository uses the relay yet. opencode's session API runs its model with the
tools registered in its own process only, not those of MCP servers, so the adapter refuses a turn
with host tools; the relay was run against opencode's older session API, where the model called a
host tool through it and answered with the result the host gave.

## Development

Run the package's tests with `bun run test packages/harness`. They run sessions, the bridge's
handlers, and the relay over fakes, without a transport; the bridge over a real WebSocket, launched
in a local sandbox, is tested in the opencode adapter. See [testing](../../docs/testing.md).
