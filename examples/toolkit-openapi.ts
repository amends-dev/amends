/**
 * The operations of an HTTP API, given to an agent as tools: the API's OpenAPI document is read
 * into operations, which become a tool source, and the toolkit of a turn presents them as a
 * search, so the model is shown two tools however many operations there are.
 *
 * Needs ANTHROPIC_API_KEY. Run with `bun examples/toolkit-openapi.ts`.
 */

import { Agent, Harness } from "@amends-dev/harness"
import { AmendsAgent, Models } from "@amends-dev/harness-amends"
import { Assembly, Http, OpenApi, ToolSearch } from "@amends-dev/toolkit"
import { BunRuntime } from "@effect/platform-bun"
import { Config, Console, Effect, Layer, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http"

// Swagger's Petstore, a public API with an OpenAPI document and no credentials.
const documentUrl = "https://petstore3.swagger.io/api/v3/openapi.json"
const baseUrl = "https://petstore3.swagger.io/api/v3"

const program = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient

  // The API's document, read as JSON. Nothing it refers to outside itself is fetched.
  const document = yield* client.get(documentUrl).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap((response) => response.json),
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Json))
  )
  const { operations, skipped } = yield* OpenApi.readOperations(document)
  yield* Console.log(`${operations.length} operations are tools; ${skipped.length} cannot be`)

  // The source sends each operation's request to the base URL, over a client that would carry
  // the API's credentials, if it had any.
  const petstore = yield* Http.make({ name: "petstore", baseUrl, client, operations })

  // The toolkit of the turn: the operations that only read. Search presents them to the model as
  // `tool_search` and `tool_call`, so what it is shown stays small.
  const assembled = yield* Assembly.toolkit(
    [{ source: petstore, definitions: operations.map((operation) => operation.definition) }],
    (_source, definition) => (definition.annotations.readOnly === true ? "allow" : "block")
  )
  const toolkit = yield* ToolSearch.toolkit(assembled)

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
  const session = yield* Harness.make(agent).createSession({ id: Agent.SessionId.make("petstore") })
  const answer = yield* session.generate({
    prompt: "How many pets does the store have in each status? Search for a tool that reads the inventory.",
    toolkit
  })
  yield* Console.log(answer.toolCalls.map((call) => `-> ${call.name} ${JSON.stringify(call.params)}`).join("\n"))
  yield* Console.log(answer.text)
  yield* session.stop
}).pipe(Effect.provide(Models.layer.pipe(Layer.provideMerge(FetchHttpClient.layer))))

BunRuntime.runMain(program)
