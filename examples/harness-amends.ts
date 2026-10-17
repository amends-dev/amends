/**
 * An agent in this process, over an Effect AI language model, with no sandbox: one turn streamed
 * as it happens, and one returned whole.
 *
 * Needs ANTHROPIC_API_KEY. Run with `bun examples/harness-amends.ts`.
 */

import { Agent, Harness } from "@amends-dev/harness"
import { AmendsAgent, Models } from "@amends-dev/harness-amends"
import { BunRuntime } from "@effect/platform-bun"
import { Config, Console, Effect, Layer, Stream } from "effect"
import { FetchHttpClient } from "effect/http"

const program = Effect.gen(function* () {
  const agent = yield* AmendsAgent.make({
    model: {
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      protocol: "anthropic-messages",
      url: "https://api.anthropic.com/v1",
      apiKey: yield* Config.Redacted("ANTHROPIC_API_KEY"),
      contextWindow: 200_000
    }
  })
  const harness = Harness.make(agent)
  const session = yield* harness.createSession({ id: Agent.SessionId.make("hello") })

  // A turn streams its parts: the answer comes as text deltas, and `finish` ends the turn.
  yield* session.stream({ prompt: "In two sentences, what is a sandbox?" }).pipe(
    Stream.runForEach((part) => {
      if (part.type === "text-delta") return Effect.sync(() => process.stdout.write(part.delta))
      if (part.type === "finish") return Console.log(`\n(finished: ${part.reason})`)
      return Effect.void
    })
  )

  // Or the turn comes back whole, once it ends, and `text` is its answer.
  const answer = yield* session.generate({ prompt: "And in one word?" })
  yield* Console.log(answer.text)

  // Releasing the session returns its state, to resume it later on any host, on any agent.
  yield* session.stop
}).pipe(Effect.provide(Models.layer.pipe(Layer.provide(FetchHttpClient.layer))))

BunRuntime.runMain(program)
