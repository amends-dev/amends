# opencode harness

opencode as an agent for the [v2 harness](../../packages/harness-v2/README.md). opencode works in
the sandbox behind its bridge, which drives opencode's server over the session API that opencode
1.18 added. Hosts reach the bridge through `BridgeClient`; nothing else of opencode is exposed
outside the sandbox.

## Running it

`OpencodeAgent.make` gives the agent a harness runs. Its options are the model a turn runs on
when it names none, as opencode names models (`provider/model`); the `port` the bridge listens on,
which has no default; and the host's `token` function, which derives each sandbox's bridge token
from its id with a secret every host shares, such as an HMAC. opencode's `config`, as its
`opencode.json` takes it, and its `env`, such as a model provider's API key, take effect when the
bridge starts opencode's server; a server already running keeps the ones it started with.

`make` bundles the bridge program with `Bun.build`, so the host runs on Bun, with the adapter's
sources. It needs `Crypto` and a `Socket.WebSocketConstructor` that sends headers, as Bun's and
Node's do. The caller creates each sandbox with the harness's `template` and `ports`.

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
giving it its launch options on standard input. `src/bridge/main.ts` is the program: it makes
the agent in `src/bridge/Agent.ts` from the agent options and serves it on the port with
`BunBridge.serve`. Bun's server never finishes stopping once a WebSocket has been open, so
`BunBridge` runs it in a scope of its own, which it gives a second to close.

When the first session starts, the bridge starts opencode's server, `opencode serve`, on
`127.0.0.1` at a port the server picks, behind a password it makes for that start and gives the
server only in its environment. One server serves every session in the sandbox, each in its own
directory. A server that fails to start is started again by the next session; one that exits by
itself takes the bridge with it, and the next session launches both again. opencode keeps its
configuration and data where it would for any user of the sandbox, under its home, unless `env`
moves them, as with `XDG_DATA_HOME`.

## Sessions and turns

Each session is an opencode session, and the agent's state names it with the session's model. A
session that starts in a sandbox whose opencode has no record of it, such as one that started on
another agent, starts a new opencode session from the conversation: `History` writes the
conversation as the events opencode records, tool calls included, and replays them into it.

A turn is a prompt to the session, on the model the turn names, which switches the session's model,
once opencode has loaded that model's provider. `Turn` translates the events opencode records for
the turn into the harness's stream parts, as they happen. opencode records text, reasoning, and a
tool's input whole when they end, so each streams as one delta, and every tool runs inside opencode,
so its calls and results are `providerExecuted`. A turn the bridge aborts is interrupted in
opencode, and destroying a session deletes it there.

## Testing

`test/turn.test.ts` and `test/history.test.ts` translate events without a server.
`test/agent.test.ts` runs the agent against a fake of opencode's server from `test/fakes.ts`.
`test/server.test.ts` and `test/main.test.ts` start real processes: the server, and the bridge
program launched by `BridgeClient`, with `test/fake-opencode-server.js` standing in for
`opencode serve`. `test/bridge.test.ts` has `BridgeClient` launch `test/fake-bridge.ts`, a bridge
over a stand-in agent, in a local sandbox, and reach it over a WebSocket: launching, reconnecting,
launching it again after it dies, letting go when the sandbox is gone, refusing a wrong token, and
continuing on another host. `test/template.test.ts` runs the template
with its commands answered as a sandbox would answer them. `test/live.test.ts`, and the template's
live test, which installs Bun and opencode in a temporary home, run only with
`AMENDS_TEST_OPENCODE=1`, and the hosts' tests run on Daytona too with `AMENDS_TEST_DAYTONA=1`;
[Testing](../../docs/testing.md) says what they run.
