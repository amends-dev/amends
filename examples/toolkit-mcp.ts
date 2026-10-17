/**
 * The tools of an MCP server, given to an agent: an MCP server on this machine, serving one tool
 * with Effect's own `McpServer`, becomes a tool source, whose tools are assembled into the toolkit
 * of a turn.
 *
 * Needs ANTHROPIC_API_KEY. Run with `bun examples/toolkit-mcp.ts`.
 */

import { Agent, Harness } from "@amends-dev/harness"
import { AmendsAgent, Models } from "@amends-dev/harness-amends"
import { Assembly, Mcp } from "@amends-dev/toolkit"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Config, Console, Effect, Layer, Schema } from "effect"
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai"
import { FetchHttpClient, HttpClient, HttpRouter } from "effect/http"
import { NetAddress } from "effect/net"

const LookUpCodeword = Tool.make("look_up_codeword", {
  description: "Looks up the codeword for a topic",
  parameters: Schema.Struct({ topic: Schema.String }),
  success: Schema.String
})
const Codewords = Toolkit.make(LookUpCodeword)

/** Serves `look_up_codeword` over MCP on this machine until the scope closes, at the URL it returns. */
const serveCodewords = Effect.gen(function* () {
  const app = yield* HttpRouter.toHttpEffect(
    McpServer.toolkit(Codewords).pipe(
      Layer.provide(
        Codewords.toLayer({ look_up_codeword: ({ topic }) => Effect.succeed(`${topic.toUpperCase()}-42`) })
      ),
      Layer.provide(
        McpServer.layerHttp({ name: "codewords", version: "1.0.0", path: "/mcp", protocols: [McpProtocol.v2025_11_25] })
      )
    )
  )
  const server = yield* BunHttpServer.make({ hostname: "127.0.0.1", port: 0 })
  yield* server.serve(app)
  if (NetAddress.isUnixPathAddress(server.address)) return yield* Effect.die("The server listens on no port")
  return `http://127.0.0.1:${server.address.port}/mcp`
})

const program = Effect.gen(function* () {
  const url = yield* serveCodewords

  // The source of the server's tools. In your program the server is elsewhere, and the client
  // carries its credentials; the source never sees them.
  const codewords = yield* Mcp.http({ name: "codewords", url, client: yield* HttpClient.HttpClient })
  const definitions = yield* codewords.discover
  yield* Console.log(`The server has ${definitions.map((definition) => definition.name).join(", ")}`)

  // The toolkit of the turn: every tool of the source, allowed. The model knows each as
  // `codewords__<name>`, and a call reaches the server.
  const toolkit = yield* Assembly.toolkit([{ source: codewords, definitions }], () => "allow")

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
  const session = yield* Harness.make(agent).createSession({ id: Agent.SessionId.make("codewords") })
  const answer = yield* session.generate({
    prompt: "What is the codeword for the topic `harbor`? Use the tool.",
    toolkit
  })
  yield* Console.log(answer.toolCalls.map((call) => `-> ${call.name}`).join("\n"))
  yield* Console.log(answer.text)
  yield* session.stop
}).pipe(Effect.scoped, Effect.provide(Models.layer.pipe(Layer.provideMerge(FetchHttpClient.layer))))

BunRuntime.runMain(program)
