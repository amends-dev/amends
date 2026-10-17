/**
 * Claude Agent SDK as an agent, working in a sandbox on this machine behind the harness bridge:
 * one turn, then the file it made read back from the sandbox.
 *
 * Needs ANTHROPIC_API_KEY. The first run installs Claude into the sandbox's home, which takes a
 * minute. Run with `bun examples/harness-claude.ts`.
 */

import { createHmac } from "node:crypto"
import { tmpdir } from "node:os"
import { Agent, Harness } from "@amends-dev/harness"
import { ClaudeAgent } from "@amends-dev/harness-claude"
import { SandboxProvider } from "@amends-dev/sandbox"
import { LocalSandboxProvider } from "@amends-dev/sandbox-local"
import { BunRuntime, BunServices, BunSocket } from "@effect/platform-bun"
import { Config, Console, Effect, Layer, Redacted } from "effect"

const sandboxes = LocalSandboxProvider.layer({ directory: `${tmpdir()}/amends-examples` }).pipe(
  Layer.provide(BunServices.layer)
)

const program = Effect.gen(function* () {
  // Every host that connects to a sandbox's bridge must derive the same token from its id; this
  // secret is for the example alone.
  const secret = yield* Config.Redacted("BRIDGE_SECRET").pipe(Config.withDefault(Redacted.make("examples")))
  const agent = yield* ClaudeAgent.make({
    model: {
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      protocol: "anthropic-messages",
      url: "https://api.anthropic.com/v1",
      apiKey: yield* Config.Redacted("ANTHROPIC_API_KEY")
    },
    token: (sandboxId) =>
      Redacted.make(createHmac("sha256", Redacted.value(secret)).update(sandboxId).digest("base64url"))
  })
  const harness = Harness.make(agent)

  // The sandbox comes from the agent's template, which installs Claude, and is destroyed with the scope.
  const sandboxProvider = yield* SandboxProvider.SandboxProvider
  const sandbox = yield* sandboxProvider.createScoped({ template: harness.agent.template })

  const id = Agent.SessionId.make("notes")
  const session = yield* harness.createSession({ sandbox, id })
  const answer = yield* session.generate({
    prompt: "Write three facts about sandboxes to notes.md, then say which you find most surprising."
  })
  yield* Console.log(answer.text)
  yield* session.stop

  // The session worked in its own directory of the sandbox, named after it.
  const notes = yield* sandbox.fileSystem.readFileString(`${sandbox.workingDirectory}/${id}/notes.md`)
  yield* Console.log(`\n${notes}`)
}).pipe(
  Effect.scoped,
  Effect.provide(Layer.mergeAll(sandboxes, BunServices.layer, BunSocket.layerWebSocketConstructor))
)

BunRuntime.runMain(program)
