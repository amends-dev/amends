# @amends/harness-opencode

opencode as an agent for the [`@amends/harness`](../../packages/harness) contract. opencode works
in the sandbox behind its bridge, a program the agent's template installs there with opencode
itself: the bridge drives opencode's server, and hosts reach the bridge over a WebSocket on a port
of the sandbox's. Nothing else of opencode is exposed outside the sandbox, and hosts that start
sessions in a sandbox with the same options share its bridge and its server, whichever host
launched them.

opencode has two session APIs, and the package has an agent for each:

| Agent            | Drives                          | Takes                                                                       |
| ---------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `OpencodeAgent`  | opencode 1's `/session` API     | all of a turn: instructions, JSON, files, host tools, approvals, compaction |
| `Opencode2Agent` | opencode 2's `/api/session` API | a turn's prompt, on its model; keeps a session's events numbered            |

Use `OpencodeAgent`. `Opencode2Agent` follows opencode 2's API, which opencode 1.18 serves as a
preview, and takes more of a turn as opencode 2 does. Both run the opencode the template installs,
opencode 1.18.23, and share everything but the session API they drive.

## Install

```sh
bun add @amends/harness-opencode @amends/harness @amends/sandbox effect
```

Add a sandbox provider, such as [`@amends/sandbox-local`](../sandbox-local) for this machine or
[`@amends/sandbox-daytona`](../sandbox-daytona). The host runs on Bun: `OpencodeAgent.make`
bundles the bridge program with `Bun.build`. It needs Effect's `Crypto` and a
`Socket.WebSocketConstructor` that sends headers, as `@effect/platform-bun` provides them.

## Quick start

`OpencodeAgent.make` makes the agent on a model endpoint and a `token` function, which derives
each sandbox's bridge token from its id with a secret every host shares, so that every host
connects to a bridge any of them launched. The caller creates each sandbox with the agent's
`template`, which installs opencode and the bridge, and `Harness.make` runs the agent in it.

```ts
import { OpencodeAgent } from "@amends/harness-opencode";
import { Agent, Harness } from "@amends/harness";
import { SandboxProvider } from "@amends/sandbox";
import { BunServices, BunSocket } from "@effect/platform-bun";
import { Config, Effect, Layer, Redacted } from "effect";
import { createHmac } from "node:crypto";

declare const sandboxes: Layer.Layer<SandboxProvider.SandboxProvider>; // a sandbox provider

const program = Effect.gen(function* () {
  // Every host derives a sandbox's bridge token from its id with a secret the hosts share.
  const secret = yield* Config.Redacted("BRIDGE_SECRET");
  const agent = yield* OpencodeAgent.make({
    model: {
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      protocol: "anthropic-messages",
      url: "https://api.anthropic.com/v1",
      apiKey: yield* Config.Redacted("ANTHROPIC_API_KEY"),
    },
    token: (sandboxId) =>
      Redacted.make(
        createHmac("sha256", Redacted.value(secret)).update(sandboxId).digest("base64url"),
      ),
  });
  const harness = Harness.make(agent);
  const sandboxProvider = yield* SandboxProvider.SandboxProvider;
  const sandbox = yield* sandboxProvider.createScoped({ template: harness.agent.template });
  const session = yield* harness.createSession({ sandbox, id: Agent.SessionId.make("review") });
  const answer = yield* session.generate({ prompt: "Summarize README.md" });
  return answer.text;
}).pipe(
  Effect.scoped,
  Effect.provide(Layer.mergeAll(sandboxes, BunServices.layer, BunSocket.layerWebSocketConstructor)),
);
```

`config` is opencode's configuration, as its `opencode.json` takes it, whose providers the
models' replace: `provider` for `OpencodeAgent`, as opencode 1 names them, and `providers` for
`Opencode2Agent`, as opencode 2 does. `env` is the environment variables opencode's server runs
with. Both take effect when the bridge starts the server. All of the options, the keys included, name
the bridge, so an agent made with other options gets a bridge and a server of its own in a
sandbox, and never runs on another's.
[`@amends/harness`](../../packages/harness/README.md) says how sessions, turns, and releasing a
session work, which these agents do as any agent does. `Opencode2Agent.make` takes the same
options.

## In the sandbox

The template installs Bun 1.3.14 and opencode 1.18.23 in the sandbox's home, under
`~/.amends/opencode/<programs>`, a directory named for their versions. Each comes from its npm
package for the sandbox's platform, macOS or Linux with glibc on arm64 or x64, which the sandbox
downloads from npm and checks against the integrity pinned in the package. Each agent's bridge
program goes beside them as `bridge-<bundle>.js`, named for its contents, so both agents share the
programs a sandbox has. Preparing a sandbox needs `sh`,
`uname`, `curl`, `tar`, `sha512sum` or `shasum`, and access to `registry.npmjs.org`. What the
sandbox has already is kept: a sandbox whose home has the programs, such as every local sandbox
after the first on this machine, gets only a new bridge program, and a sandbox from a snapshot of
a prepared one is ready at once. The template's identity changes with the versions and the bundle;
the programs and bridge programs of versions no host launches any more are not removed.

A session launches the bridge, when none answers, with
`sh -c 'exec "$HOME/…/bun" "$HOME/…/bridge-<bundle>.js"'`, giving it its launch options on
standard input. It runs the template first, so that a sandbox a host of another version prepared
gets this version's bridge program, and Bun and opencode if their versions changed. The bridge
serves on a port the sandbox picks, which it writes to its state directory for hosts to find, and
exits once it has been idle for ten minutes or another bridge takes its place.

When the first session starts, the bridge starts opencode's server, `opencode serve`, on
`127.0.0.1` at a port the server picks, behind a password it makes for that start and gives the
server only in its environment. The server reads its configuration from a directory the bridge
makes for it, which only the sandbox's user can read and which the bridge removes when the server
stops, in place of the configuration under the sandbox user's home; a project's own configuration,
in a session's directory, applies over it. A server that has not stopped 3 seconds after the
bridge asks it to is killed. One server serves every session of the bridge, each in its own
directory. A server that fails to start is started again by the next session; one that exits by
itself takes the bridge with it, and the next session launches both again. A bridge that dies, as
when it is killed, leaves its server running, still on the turn the bridge ran, beside the server
the next bridge starts, and its configuration stays with it. `OpencodeAgent`'s bridge also serves the host's tools to
opencode as an MCP server on `127.0.0.1`, behind a token for each session. opencode keeps its data where it
would for any user of the sandbox, under its home, unless `env` moves it, as with
`XDG_DATA_HOME`.

## Models

The agents configure opencode for their endpoints. Each endpoint names its provider and model as
opencode finds them in models.dev, which tells opencode the rest of the model, such as whether it
calls tools. opencode 1 takes a model that models.dev does not list as one that calls tools but
reads no files, and opencode 2 runs it without tools. The configuration serves the model through the
endpoint's protocol, at its URL, within its limits, and under its key and headers, and asks for the
endpoint's effort in a variant of the model, which the turn's model names. opencode presents one
key, with one set of headers, for each provider and serves a model one way, so endpoints that differ
there fail `make` with `UnsupportedError`. The keys and headers reach opencode in its configuration
in the sandbox, where the commands opencode runs can read them.

opencode 1 takes a model's output limit only with its context window. An endpoint with an output
limit gives its context window too, or 0 when it has none, which opencode takes as unknown and
compacts nothing by itself. An endpoint without an output limit leaves both limits to models.dev.
opencode 1 writes at most 32,000 tokens in a response unless its server is told otherwise, so
`OpencodeAgent` raises that ceiling to the highest output limit of its endpoints.

## Sessions and turns

Each session is an opencode session, and the agent's state names it. A session whose opencode
session is still there continues it; one that starts in a sandbox whose opencode has no record of
it, such as one that started on another agent, starts a new opencode session from the
conversation. Destroying a session deletes it in opencode, and a turn the bridge aborts is
interrupted there.

### `OpencodeAgent`

A turn is a prompt to the session, on the model the turn names, with the turn's instructions as
its system prompt, the schema of an answer in JSON, and the prompt's files, which reach opencode
as data URLs or as the URLs they are. The events opencode publishes for the turn become the
harness's stream parts as they happen: text and reasoning stream as opencode writes them, a tool's
input streams whole once the tool runs, and opencode's own tools run inside opencode, so their
calls and results are `providerExecuted`. A file that opencode's `write` or `edit` tool changes is
a `file-change` part, with its path relative to the session's directory. An answer in JSON is the
text of the last step.

The host's tools reach opencode through the bridge's MCP server, which opencode names `host`, so
it calls a tool `host_<tool>`: the names of the host's tools fit in 59 characters, as the agent's
`maxToolNameLength` says. The calls stream as the host's, which the host answers, and opencode
lists the tools again when a turn's tools change. A tool of opencode's own that asks permission,
as opencode's `permission` configuration says, streams a `tool-approval-request` and waits for
the host's answer. opencode does not ask the user questions in a turn: its `question` tool is off,
and a question asked anyway is refused.

`compact` asks opencode to summarize the conversation, on the model of its last step, and returns
the summary; opencode summarizes without instructions, so instructions fail with
`UnsupportedError`. opencode also compacts by itself when a turn nears the model's context window,
which streams as a `compaction` part. A conversation from another agent is written into the new
opencode session as one message the model reads with the first prompt, the files of its user
messages beside it, since opencode 1 records no steps but its own.

### `Opencode2Agent`

A turn is a prompt to the session, on the model the turn names, which switches the session's model
or its variant once opencode has loaded that model's provider; a provider opencode has not loaded
within ten seconds fails the turn with `UnsupportedError`. The events opencode records for the
turn become the harness's stream parts as they happen. opencode records text, reasoning, and a
tool's input whole when they end, so each streams as one delta, and every tool runs inside
opencode, so its calls and results are `providerExecuted`. A conversation from another agent is
written as the events opencode records, tool calls included, and replayed into the new session,
and only a session whose opencode session was kept continues there a turn the bridge did not
finish.

opencode 2's session API does not yet take a turn's instructions, an answer in JSON, the host's
tools, a request to compact, files in a prompt, or an answer to a permission request, which fail
with `UnsupportedError`.

## Errors

The agents' operations fail with `HarnessError`, naming the agent `opencode` or `opencode2`:
`UnsupportedError` for what opencode cannot do, a turn that names a model the agent has none of,
endpoints opencode cannot serve together, or a provider it has not loaded; `UnavailableError` when its server cannot
be reached, exits, does not listen in time, or asks to be retried; `NotFoundError` for what the
server has no record of; `AgentContractError` for state or events the agent cannot read; and
`UnknownError` for the rest.

## Development

Run the package's tests with `bun run test adapters/harness-opencode`: each agent's sessions
against a fake of opencode's server, scripted turn by turn, and the translation of its events and
conversations, under `test/v1` and `test/v2`; the
server and the bridge program as real processes, with `test/fake-opencode-server.js` standing in
for `opencode serve`; the bridge launched by `BridgeClient` in a sandbox on this machine and
reached over a WebSocket; and the template with its commands answered as a sandbox would answer
them. With `AMENDS_TEST_OPENCODE=1`, the live tests run the opencode on this
machine's `PATH` under both agents, whose turns OpenCode Zen's free model answers. See [testing](../../docs/testing.md).
`bun run dist check adapters/harness-opencode` builds the package as npm gets it and checks it as
a consumer; see [publishing](../../docs/publishing.md).
