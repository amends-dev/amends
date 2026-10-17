/**
 * opencode as an agent, working in a sandbox on this machine: a streamed turn that writes a file,
 * the session saved as JSON and resumed, and the file read back from the sandbox.
 *
 * Needs ANTHROPIC_API_KEY. The first run installs opencode into the sandbox's home, which takes a
 * minute. Run with `bun examples/harness-opencode.ts`.
 */

import { createHmac } from "node:crypto"
import { tmpdir } from "node:os"
import { Agent, Harness, Session, type StreamPart } from "@amends-dev/harness"
import { OpencodeAgent } from "@amends-dev/harness-opencode"
import { SandboxProvider } from "@amends-dev/sandbox"
import { LocalSandboxProvider } from "@amends-dev/sandbox-local"
import { BunRuntime, BunServices, BunSocket } from "@effect/platform-bun"
import { Config, Console, Effect, Layer, Redacted, Schema, Stream } from "effect"

const sandboxes = LocalSandboxProvider.layer({ directory: `${tmpdir()}/amends-examples` }).pipe(
  Layer.provide(BunServices.layer)
)

const SessionStateJson = Schema.fromJsonString(Schema.toCodecJson(Session.SessionState))

/** Prints what a turn streams: the agent's text, the tools it runs, and the files it changes. */
const show = (part: StreamPart.StreamPart) => {
  switch (part.type) {
    case "text-delta":
      return Effect.sync(() => process.stdout.write(part.delta))
    case "tool-call":
      return Console.log(`-> ${part.name}`)
    case "file-change":
      return Console.log(`   ${part.event} ${part.path}`)
    case "finish":
      return Console.log(`\n(finished: ${part.reason})`)
    default:
      return Effect.void
  }
}

const program = Effect.gen(function* () {
  // Every host that connects to a sandbox's bridge must derive the same token from its id; this
  // secret is for the example alone.
  const secret = yield* Config.Redacted("BRIDGE_SECRET").pipe(Config.withDefault(Redacted.make("examples")))
  const agent = yield* OpencodeAgent.make({
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

  // The sandbox comes from the agent's template, which installs opencode, and is destroyed with the scope.
  const sandboxProvider = yield* SandboxProvider.SandboxProvider
  const sandbox = yield* sandboxProvider.createScoped({ template: harness.agent.template })

  const id = Agent.SessionId.make("haiku")
  const session = yield* harness.createSession({ sandbox, id })
  yield* session.stream({ prompt: "Write a haiku about sandboxes to haiku.txt" }).pipe(Stream.runForEach(show))

  // The session's state is JSON: store it, and resume it later, on any host.
  const saved = yield* Schema.encodeEffect(SessionStateJson)(yield* session.detach)
  const resumed = yield* harness.createSession({
    sandbox,
    resumeFrom: yield* Schema.decodeEffect(SessionStateJson)(saved)
  })
  const answer = yield* resumed.generate({ prompt: "Add a title line above the haiku." })
  yield* Console.log(answer.text)
  yield* resumed.stop

  // The session worked in its own directory of the sandbox, named after it.
  const haiku = yield* sandbox.fileSystem.readFileString(`${sandbox.workingDirectory}/${id}/haiku.txt`)
  yield* Console.log(`\n${haiku}`)
}).pipe(
  Effect.scoped,
  Effect.provide(Layer.mergeAll(sandboxes, BunServices.layer, BunSocket.layerWebSocketConstructor))
)

BunRuntime.runMain(program)
