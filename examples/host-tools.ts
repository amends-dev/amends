/**
 * Your own tools, given to an agent: the host runs them as the agent calls them, and a tool that
 * needs approval waits until the session is told it may run.
 *
 * Needs ANTHROPIC_API_KEY. Run with `bun examples/host-tools.ts`.
 */

import { Agent, Harness } from "@amends-dev/harness"
import { AmendsAgent, Models } from "@amends-dev/harness-amends"
import { BunRuntime } from "@effect/platform-bun"
import { Config, Console, Effect, Layer, Schema, Stream } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { FetchHttpClient } from "effect/http"

const Weather = Tool.make("weather", {
  description: "The weather in a city right now",
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.Struct({ celsius: Schema.Finite, sky: Schema.String })
})

const BookTable = Tool.make("book_table", {
  description: "Books a table at a restaurant",
  parameters: Schema.Struct({ restaurant: Schema.String, people: Schema.Int }),
  success: Schema.String,
  // The session asks before it runs this one.
  needsApproval: true
})

const Tools = Toolkit.make(Weather, BookTable)

const program = Effect.gen(function* () {
  // The toolkit: the tools with their handlers, which run here, on the host.
  const toolkit = yield* Tools.pipe(
    Effect.provide(
      Tools.toLayer({
        weather: ({ city }) => Effect.succeed({ celsius: city === "Lisbon" ? 24 : 11, sky: "clear" }),
        book_table: ({ restaurant, people }) => Effect.succeed(`Booked ${restaurant} for ${people}`)
      })
    )
  )

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
  const session = yield* Harness.make(agent).createSession({ id: Agent.SessionId.make("dinner") })

  yield* session
    .stream({
      prompt: "What is the weather in Lisbon? If it is warm and clear, book a table for two at Ramiro.",
      toolkit
    })
    .pipe(
      Stream.runForEach((part) => {
        switch (part.type) {
          case "tool-call":
            return Console.log(`-> ${part.name} ${JSON.stringify(part.params)}`)
          case "tool-approval-request":
            // A person would decide here; this program approves every call.
            return session.approve({ approvalId: part.approvalId, approved: true })
          case "tool-result":
            return Console.log(`<- ${part.name} ${JSON.stringify(part.result)}`)
          case "text-delta":
            return Effect.sync(() => process.stdout.write(part.delta))
          case "finish":
            return Console.log("")
          default:
            return Effect.void
        }
      })
    )

  yield* session.stop
}).pipe(Effect.provide(Models.layer.pipe(Layer.provide(FetchHttpClient.layer))))

BunRuntime.runMain(program)
