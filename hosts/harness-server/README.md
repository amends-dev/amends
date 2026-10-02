# Harness server

This Bun program runs a harness inside a sandbox. A host compiles it with `bun build --compile`,
uploads it into the sandbox, and starts it in the background as `harness-server <state file>`. It
serves the [harness server protocol](../../packages/environment/README.md#the-harness-server) over
HTTP on a free port, with a token of its own, and once it listens writes the port, the token, and
the protocol version it speaks to the state file, readable by its user only, for hosts to find it.
It runs apart from the host that started it, holding one session at a time, until a host asks it
to stop. It logs to `<state file>.log`, since its output may reach no one.

`HarnessServerHost.served` is what this build runs: amends's own
[harness](../../packages/harness-amends/README.md), with the model code of the
[Anthropic](../../adapters/connection-anthropic/README.md) and
[OpenAI-compatible](../../adapters/connection-openai-compatible/README.md) connections. A host lists
the same harnesses in the `HarnessServer.Program` it installs, as the
[local host](../local/README.md#turns) does from this value, so what it uploads runs what it
offers. `HarnessServerHost.run(statePath)` serves the routes over Bun's HTTP server, and
`src/index.ts` launches it.

On `SIGTERM`, Bun's server lets requests in flight finish for up to 20 seconds, then the server ends
its session and exits.

## Verify

```bash
bun run check
bun run test
```

The [environment's tests](../../packages/environment/test/environment.test.ts) serve the protocol's
routes in memory, and the local host's `turns.test.ts` compiles this program, uploads it into local
sandboxes, and runs agents' turns through it, including one whose host is killed partway and one
whose sandbox is destroyed partway.
