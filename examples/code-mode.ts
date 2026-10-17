/**
 * Code mode: the tools of an MCP server presented to an agent as one tool, `execute`, that runs
 * code the model writes on opencode's interpreter. The model calls the tools from code, combines
 * their results there, and returns only what it needs.
 *
 * Needs ANTHROPIC_API_KEY. Run with `bun examples/code-mode.ts`.
 */

import { OpencodeCodeRuntime } from "@amends-dev/codemode-opencode"
import { Agent, Harness } from "@amends-dev/harness"
import { AmendsAgent, Models } from "@amends-dev/harness-amends"
import { Assembly, CodeMode, Mcp } from "@amends-dev/toolkit"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Config, Console, Effect, Layer, Schema, Stream } from "effect"
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai"
import { FetchHttpClient, HttpClient, HttpRouter } from "effect/http"
import { NetAddress } from "effect/net"

// A library's catalog, as an MCP server: one tool lists the books of an author, another a book's pages.
const books = [
  { author: "Le Guin", title: "The Dispossessed", pages: 341 },
  { author: "Le Guin", title: "The Left Hand of Darkness", pages: 304 },
  { author: "Lem", title: "Solaris", pages: 204 }
]
const ListBooks = Tool.make("list_books", {
  description: "Lists the titles an author wrote",
  parameters: Schema.Struct({ author: Schema.String }),
  success: Schema.Array(Schema.String)
})
const PagesOf = Tool.make("pages_of", {
  description: "How many pages a book has",
  parameters: Schema.Struct({ title: Schema.String }),
  success: Schema.Int
})
const Library = Toolkit.make(ListBooks, PagesOf)

/** Serves the library over MCP on this machine until the scope closes, at the URL it returns. */
const serveLibrary = Effect.gen(function* () {
  const app = yield* HttpRouter.toHttpEffect(
    McpServer.toolkit(Library).pipe(
      Layer.provide(
        Library.toLayer({
          list_books: ({ author }) =>
            Effect.succeed(books.filter((book) => book.author === author).map((book) => book.title)),
          pages_of: ({ title }) => Effect.succeed(books.find((book) => book.title === title)?.pages ?? 0)
        })
      ),
      Layer.provide(
        McpServer.layerHttp({ name: "library", version: "1.0.0", path: "/mcp", protocols: [McpProtocol.v2025_11_25] })
      )
    )
  )
  const server = yield* BunHttpServer.make({ hostname: "127.0.0.1", port: 0 })
  yield* server.serve(app)
  if (NetAddress.isUnixPathAddress(server.address)) return yield* Effect.die("The server listens on no port")
  return `http://127.0.0.1:${server.address.port}/mcp`
})

const program = Effect.gen(function* () {
  const library = yield* Mcp.http({ name: "library", url: yield* serveLibrary, client: yield* HttpClient.HttpClient })
  const assembled = yield* Assembly.toolkit([{ source: library, definitions: yield* library.discover }], () => "allow")

  // The model is shown one tool, `execute`, with the library's tools declared in TypeScript; its
  // code runs on opencode's interpreter, which reaches nothing but those tools.
  const toolkit = yield* CodeMode.toolkit(assembled, OpencodeCodeRuntime.make({ maxToolCalls: 20 }))

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
  const session = yield* Harness.make(agent).createSession({ id: Agent.SessionId.make("library") })
  yield* session
    .stream({ prompt: "How many pages did Le Guin write in total, across her books in the library?", toolkit })
    .pipe(
      Stream.runForEach((part) => {
        // The code the model wrote, and what its run gave back.
        if (part.type === "tool-call")
          return Console.log(`-> ${part.name}\n${(part.params as { code: string }).code}\n`)
        if (part.type === "tool-result") return Console.log(`<- ${JSON.stringify(part.result)}\n`)
        if (part.type === "text-delta") return Effect.sync(() => process.stdout.write(part.delta))
        if (part.type === "finish") return Console.log("")
        return Effect.void
      })
    )
  yield* session.stop
}).pipe(Effect.scoped, Effect.provide(Models.layer.pipe(Layer.provideMerge(FetchHttpClient.layer))))

BunRuntime.runMain(program)
