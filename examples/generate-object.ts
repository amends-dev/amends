/**
 * A turn that answers with an object: the agent is asked for JSON, and the answer is decoded with
 * a schema, so the program gets a value of the type it asked for.
 *
 * Needs ANTHROPIC_API_KEY. Run with `bun examples/generate-object.ts`.
 */

import { Agent, Harness } from "@amends-dev/harness"
import { AmendsAgent, Models } from "@amends-dev/harness-amends"
import { BunRuntime } from "@effect/platform-bun"
import { Config, Console, Effect, Layer, Schema } from "effect"
import { FetchHttpClient } from "effect/http"

const Agenda = Schema.Struct({
  title: Schema.String,
  items: Schema.Array(
    Schema.Struct({
      topic: Schema.String,
      minutes: Schema.Int,
      owner: Schema.String
    })
  )
})

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
  const session = yield* Harness.make(agent).createSession({ id: Agent.SessionId.make("planning") })

  // `value` is an `Agenda`; a turn whose answer does not decode fails instead.
  const result = yield* session.generateObject({
    prompt: "Plan a 30-minute kickoff for a team of three building a weather app. Three items.",
    schema: Agenda,
    objectName: "agenda"
  })
  yield* Console.log(result.value.title)
  for (const item of result.value.items) {
    yield* Console.log(`- ${item.topic} (${item.minutes} min, ${item.owner})`)
  }

  yield* session.stop
}).pipe(Effect.provide(Models.layer.pipe(Layer.provide(FetchHttpClient.layer))))

BunRuntime.runMain(program)
