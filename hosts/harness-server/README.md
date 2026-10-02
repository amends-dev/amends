# Harness server

This Bun program runs a harness inside a sandbox. A host compiles it with `bun build --compile`,
uploads it into the sandbox, and starts one process of it for each harness session; the process
serves the [harness server protocol](../../packages/environment/README.md#the-harness-server) on
its standard input and output and logs to standard error. It stops when its input ends.

`HarnessServerHost.served` is what this build runs: amends's own
[harness](../../packages/harness-amends/README.md), with the model code of the
[Anthropic](../../adapters/connection-anthropic/README.md) and
[OpenAI-compatible](../../adapters/connection-openai-compatible/README.md) connections. A host lists
the same harnesses in the `HarnessServer.Program` it installs, as the
[local host](../local/README.md#turns) does from this value, so what it uploads runs what it
offers. `HarnessServerHost.layer` is the server over Bun's standard input and output, and
`src/index.ts` launches it.

## Verify

```bash
bun run check
bun run test
```

The [environment's tests](../../packages/environment/test/environment.test.ts) run the server's
protocol in memory over standard input and output, and the local host's `turns.test.ts` compiles
this program, uploads it into a local sandbox, and runs an agent's turn through it.
