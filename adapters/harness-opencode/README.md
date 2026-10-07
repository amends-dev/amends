# opencode harness

opencode as an agent for the [harness contract](../../packages/harness/README.md). opencode works in
the sandbox behind its bridge, which drives opencode's server over the session API that opencode
1.18 added. Hosts reach the bridge through `BridgeClient`; nothing else of opencode is exposed
outside the sandbox.

## Running it

`OpencodeAgent.make` gives the agent a harness runs. Its options are `Agent.Options`, the `model`
endpoint a turn runs on when it names none and the `models` a turn can name, by name, with the `port`
the bridge listens on, which has no default; and the host's `token` function, which derives each sandbox's bridge token
from its id with a secret every host shares, such as an HMAC. opencode's `config`, as opencode 1.18
writes its `opencode.json`, whose `providers` the models' replace, and its `env` take effect when
the bridge starts opencode's server; a server already running keeps the ones it started with.

`Models` configures opencode for the endpoints. Each endpoint names its provider and model as
opencode finds them in models.dev, which tells opencode the rest of the model, such as whether it
calls tools; the configuration serves the model through the endpoint's protocol, at its URL, with
its output limit, and under its key, and asks for the endpoint's effort in a variant of the model,
which the turn's model names. opencode presents one key for each provider and serves a model one
way, so endpoints that differ there fail `make` with `UnsupportedError`. The keys reach opencode in
its configuration in the sandbox, where the commands opencode runs can read them. A model that
models.dev does not list runs without tools.

`make` bundles the bridge program with `Bun.build`, so the host runs on Bun, with the adapter's
sources. It needs `Crypto` and a `Socket.WebSocketConstructor` that sends headers, as Bun's and
Node's do. The caller creates each sandbox with the `template` of the harness's `agent`, whose
`ports` the harness exposes there.

`OpencodeAgent.integration` is the integration of opencode, for a host to install with what the
agent takes besides its models: the `port`, the `token` function, and opencode's `config` and `env`.
It bundles the bridge once, when it is made, and needs what `make` does, and says that opencode
requires a sandbox. A connection to it gives no settings and no credential, and is always healthy,
as it reaches nothing; its harness runs on the endpoints it is given, which connections to model
providers give, and refuses endpoints that opencode cannot serve together with `UnsupportedError`. Its id is `opencode-agent`, as `opencode` is
the id of OpenCode Zen, a provider of models in the catalog.

## In the sandbox

The template installs Bun 1.3.14 and opencode 1.18.23 in the sandbox's home, under
`~/.amends/opencode/<programs>`, a directory named for their versions. Each comes from its npm
package for the sandbox's platform, macOS or Linux with glibc on arm64 or x64, which the sandbox
downloads from npm and checks against the integrity pinned in `src/Template.ts`. The bridge program
goes beside them as `bridge-<bundle>.js`, named for its contents. Preparing a sandbox needs `sh`,
`uname`, `curl`, `tar`, `sha512sum` or `shasum`, and access to `registry.npmjs.org`. What the
sandbox has already is kept, so a sandbox whose home has the programs, such as every local sandbox
after the first on this machine, gets only a new bridge program, and a sandbox from a snapshot of a
prepared one is ready at once. The template's identity changes with the versions and the bundle.

A session launches the bridge, when none answers, with `sh -c 'exec "$HOME/…/bun" "$HOME/…/bridge-<bundle>.js"'`,
giving it its launch options on standard input. It runs the template first, so that a sandbox a
host of another version prepared gets this version's bridge program, and Bun and opencode if their
versions changed. `src/bridge/main.ts` is the program: it makes
the driver in `src/bridge/Driver.ts` from the agent options and serves it on the port with
`BunBridge.serve`. Bun's server never finishes stopping once a WebSocket has been open, so
`BunBridge` runs it in a scope of its own, which it gives a second to close.

When the first session starts, the bridge starts opencode's server, `opencode serve`, on
`127.0.0.1` at a port the server picks, behind a password it makes for that start and gives the
server only in its environment. The server reads its configuration from a directory the bridge
makes for it, which only the sandbox's user can read and which the bridge removes when the server
stops, in place of the configuration under the sandbox user's home; a project's own configuration,
in a session's directory, applies over it. A server that has not stopped 3 seconds after the bridge
asks it to is killed. One server serves every session in the sandbox, each in its own
directory. A server that fails to start is started again by the next session; one that exits by
itself takes the bridge with it, and the next session launches both again. A bridge that dies, as
when it is killed, leaves its server running, still on the turn the bridge ran, beside the server
the next bridge starts, and its configuration stays with it. opencode keeps its data where it
would for any user of the sandbox, under its home, unless `env` moves it, as with `XDG_DATA_HOME`.

## Sessions and turns

Each session is an opencode session, and the agent's state names it with the session's model. A
session that starts in a sandbox whose opencode has no record of it, such as one that started on
another agent, starts a new opencode session from the conversation: `History` writes the
conversation as the events opencode records, tool calls included, and replays them into it. Only a
session whose opencode session was kept continues there a turn the bridge did not finish.

A turn is a prompt to the session, on the model the turn names, which switches the session's model
or its variant, once opencode has loaded that model's provider. `Turn` translates the events opencode records for
the turn into the harness's stream parts, as they happen. opencode records text, reasoning, and a
tool's input whole when they end, so each streams as one delta, and every tool runs inside opencode,
so its calls and results are `providerExecuted`. A turn the bridge aborts is interrupted in
opencode, and destroying a session deletes it there.

## Testing

`test/turn.test.ts` and `test/history.test.ts` translate events without a server, and
`test/models.test.ts` checks the configuration `Models` makes of endpoints, and
`test/integration.test.ts` the harnesses the integration gives.
`test/driver.test.ts` runs the driver against a fake of opencode's server from `test/fakes.ts`.
`test/server.test.ts` and `test/main.test.ts` start real processes: the server, and the bridge
program launched by `BridgeClient`, with `test/fake-opencode-server.js` standing in for
`opencode serve`. `test/bridge.test.ts` has `BridgeClient` launch `test/fake-bridge.ts`, a bridge
over a stand-in driver, in a local sandbox, and reach it over a WebSocket: launching, reconnecting,
launching it again after it dies, continuing a turn it lost then, letting go when the sandbox is
gone, refusing a wrong token, and continuing on another host. `test/template.test.ts` runs the template
with its commands answered as a sandbox would answer them. `test/live.test.ts`, and the template's
live test, which installs Bun and opencode in a temporary home, run only with
`AMENDS_TEST_OPENCODE=1`; one of them has real opencode send turns on endpoints of each protocol
to a fake of their APIs on a local port, and with `OPENROUTER_API_KEY` too, hosts set opencode up
from connections to OpenRouter, the agent, and sandboxes. The hosts' tests run on Daytona too with
`AMENDS_TEST_DAYTONA=1`;
[Testing](../../docs/testing.md) says what they run.
