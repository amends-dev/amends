import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { connectionTo, membership } from "../../../test/fixtures.ts"
import { type Answer, hostAnswering } from "../../../test/host.ts"
import { recordingStores } from "../../../test/recordingStores.ts"
import { CheckConnection, ConfigureConnection, RenameConnection } from "./command.ts"
import { Message, type Reason, Written } from "./definition.ts"

const { workspace, member } = membership
const workspaceId = workspace.id
const asMember = { workspaceId, memberId: member.id }

const search = connectionTo("connection-2", "search-api", "Search tools", "apiKey")

const check = (answer: Answer) => {
  const { sent, layer } = hostAnswering(answer)
  return CheckConnection({ workspaceId, connectionId: search.id }).effect.pipe(
    Effect.provide(CheckConnection.layer.pipe(Layer.provideMerge(layer))),
    Effect.map((message) => ({ message, sent }))
  )
}

/** What a check reports when it failed for `reason`, with the words the integration gave when it gave any. */
const checkFailure = (reason: Reason, description?: string) =>
  Message.FailedCheckConnection({
    connectionId: search.id,
    failure: { action: "Check", reason, description: Option.fromUndefinedOr(description) }
  })

describe("CheckConnection", () => {
  it.effect("asks the host to check the connection, and reports what it found", () =>
    Effect.gen(function* () {
      const { message, sent } = yield* check({ status: 200, body: { status: "healthy" } })

      expect(sent.map(({ path }) => path)).toEqual([expect.stringMatching(/\/connections\/connection-2\/check$/)])
      expect(message).toEqual(Message.CheckedConnection({ connectionId: search.id, health: { status: "healthy" } }))
    })
  )

  it.effect("reports what a system that refuses the key or the settings, or does not answer, said, in its words", () =>
    Effect.gen(function* () {
      const refused = yield* check({
        status: 200,
        body: { status: "unauthorized", description: "The server refused the key (401)." }
      })
      const lost = yield* check({ status: 200, body: { status: "unavailable" } })

      expect(refused.message).toEqual(
        Message.CheckedConnection({
          connectionId: search.id,
          health: { status: "unauthorized", description: "The server refused the key (401)." }
        })
      )
      expect(lost.message).toEqual(
        Message.CheckedConnection({ connectionId: search.id, health: { status: "unavailable" } })
      )
    })
  )

  for (const [description, answer, reason, words] of [
    [
      "the person may not manage connections",
      { status: 403, body: { _tag: "CoreError.Denied", reason: { _tag: "HumanRequired" } } },
      "Denied",
      undefined
    ],
    [
      "the connection is gone",
      { status: 404, body: { _tag: "CoreError.NotFound", resource: "Connection", id: "connection-2" } },
      "Gone",
      undefined
    ],
    [
      "the host no longer installs its integration",
      {
        status: 422,
        body: { _tag: "CoreError.Invalid", reason: { _tag: "UnknownIntegration", integration: "search-api" } }
      },
      "Uninstalled",
      undefined
    ],
    [
      "its integration refuses the setup",
      {
        status: 422,
        body: {
          _tag: "CoreError.Invalid",
          reason: { _tag: "IntegrationRefused", description: "MCP server takes no setting named region." }
        }
      },
      "Refused",
      "MCP server takes no setting named region."
    ],
    [
      "the connection takes no key",
      {
        status: 422,
        body: { _tag: "CoreError.Invalid", reason: { _tag: "Keyless", connectionId: "connection-2" } }
      },
      "Changed",
      undefined
    ],
    [
      "what was entered does not hold",
      { status: 422, body: { _tag: "CoreError.Invalid", reason: { _tag: "Malformed", description: "No." } } },
      "Invalid",
      undefined
    ],
    [
      "the host keeps no keys",
      {
        status: 503,
        body: { _tag: "CoreError.Unavailable", reason: { _tag: "CredentialsUnavailable", description: "No keys" } }
      },
      "StorageUnavailable",
      undefined
    ],
    [
      "another writer held the storage",
      {
        status: 503,
        body: {
          _tag: "CoreError.Unavailable",
          reason: { _tag: "Contention", operation: "append", description: "Held by another writer" }
        }
      },
      "Failed",
      undefined
    ],
    ["the host answers something this app can't tell", { status: 500, body: { message: "Boom" } }, "Failed", undefined],
    ["the host cannot be reached", "unreachable", "Failed", undefined]
  ] as const satisfies ReadonlyArray<readonly [string, Answer, Reason, string | undefined]>) {
    it.effect(`says the check failed for ${reason} when ${description}`, () =>
      Effect.gen(function* () {
        const { message } = yield* check(answer)

        expect(message).toEqual(checkFailure(reason, words))
      })
    )
  }
})

describe("RenameConnection", () => {
  it.effect("writes the rename with the name the person saw, and reports that the store kept it", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()
      const message = yield* RenameConnection({
        ...asMember,
        connectionId: search.id,
        name: "Search servers",
        expectedName: "Search tools"
      }).effect.pipe(Effect.provide(Layer.provide(RenameConnection.layer, layer)))

      expect(written).toEqual([
        {
          action: "ConnectionRenamed",
          payload: { connectionId: search.id, name: "Search servers", expectedName: "Search tools" }
        }
      ])
      expect(message).toEqual(Message.WroteAction({ written: Written.Rename({ connectionId: search.id }) }))
    })
  )

  it.effect("writes nothing for a name that can't be one, and says so", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()
      const message = yield* RenameConnection({
        ...asMember,
        connectionId: search.id,
        name: "   ",
        expectedName: "Search tools"
      }).effect.pipe(Effect.provide(Layer.provide(RenameConnection.layer, layer)))

      expect(written).toEqual([])
      expect(message).toEqual(
        Message.FailedWriteAction({ written: Written.Rename({ connectionId: search.id }), reason: "Invalid" })
      )
    })
  )
})

describe("ConfigureConnection", () => {
  it.effect("writes the settings as a whole, and reports that the store kept them", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()
      const settings = { url: "https://search.example.com/mcp", verbose: true }
      const message = yield* ConfigureConnection({ ...asMember, connectionId: search.id, settings }).effect.pipe(
        Effect.provide(Layer.provide(ConfigureConnection.layer, layer))
      )

      expect(written).toEqual([{ action: "ConnectionConfigured", payload: { connectionId: search.id, settings } }])
      expect(message).toEqual(Message.WroteAction({ written: Written.Configure({ connectionId: search.id }) }))
    })
  )
})
