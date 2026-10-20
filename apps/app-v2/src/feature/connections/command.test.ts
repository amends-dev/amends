import { Request } from "@amends-dev/core/request"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { connectionTo, membership } from "../../../test/fixtures.ts"
import { type Answer, hostAnswering } from "../../../test/host.ts"
import { recordingStores } from "../../../test/recordingStores.ts"
import {
  AddConnection,
  CheckConnection,
  ConfigureConnection,
  FocusField,
  RemoveConnection,
  RenameConnection,
  ReplaceConnectionKey
} from "./command.ts"
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

/** What the host answers when the call is refused for the reason each of these says, and what the Block reads in it. */
const refusals = [
  [
    "the person may not manage connections",
    { status: 403, body: { _tag: "CoreError.Denied", reason: { _tag: "HumanRequired" } } },
    "Denied",
    undefined
  ],
  [
    "the workspace or the connection is gone",
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
    "its integration refuses what was entered",
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
    { status: 422, body: { _tag: "CoreError.Invalid", reason: { _tag: "Keyless", connectionId: "connection-2" } } },
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
  ["the host answers something this app can't tell", { status: 500, body: { message: "Boom" } }, "Failed", undefined],
  ["the host cannot be reached", "unreachable", "Failed", undefined]
] as const satisfies ReadonlyArray<readonly [string, Answer, Reason, string | undefined]>

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

  for (const [description, answer, reason, words] of refusals) {
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

const failureOfReason = (action: "Create" | "ReplaceKey", reason: Reason, description?: string) => ({
  action,
  reason,
  description: Option.fromUndefinedOr(description)
})

const created = {
  id: "connection-9",
  name: "MCP server",
  integration: "search-api",
  settings: { url: "https://search.example.com/mcp" },
  auth: "apiKey",
  readiness: { _tag: "Ready" },
  manageable: true,
  createdBy: "member-1",
  createdAt: "2026-10-18T12:00:00Z"
}

const key = Request.Key.make("key-1")

const add = (
  answer: Answer,
  key: Option.Option<Request.Key>,
  overrides: Partial<{ name: string; apiKey: string }> = {}
) => {
  const { sent, layer } = hostAnswering(answer)
  return AddConnection({
    workspaceId,
    integration: "search-api",
    name: "MCP server",
    auth: "apiKey",
    apiKey: "  secret ",
    settings: { url: "https://search.example.com/mcp" },
    key,
    ...overrides
  }).effect.pipe(
    Effect.provide(AddConnection.layer.pipe(Layer.provideMerge(layer))),
    Effect.map((message) => ({ message, sent }))
  )
}

describe("AddConnection", () => {
  it.effect(
    "sends the connection with its key, ignoring the space around it, under a new request key, and reports it",
    () =>
      Effect.gen(function* () {
        const { message, sent } = yield* add({ status: 201, body: created }, Option.none())

        expect(sent).toHaveLength(1)
        expect(sent[0]?.path).toBe("/connections")
        expect(sent[0]?.payload).toEqual({
          integration: "search-api",
          name: "MCP server",
          settings: { url: "https://search.example.com/mcp" },
          auth: "apiKey",
          apiKey: "secret"
        })
        expect(sent[0]?.key).toMatch(/^[\da-f-]{36}$/)
        expect(message).toEqual(Message.AddedConnection({ connectionId: created.id as never, name: "MCP server" }))
      })
  )

  it.effect("sends no key for a connection that authenticates with none, however a key was typed", () =>
    Effect.gen(function* () {
      const { sent, layer } = hostAnswering({ status: 201, body: { ...created, auth: "none" } })
      yield* AddConnection({
        workspaceId,
        integration: "search-api",
        name: "MCP server",
        auth: "none",
        apiKey: "left over",
        settings: {},
        key: Option.none()
      }).effect.pipe(Effect.provide(AddConnection.layer.pipe(Layer.provideMerge(layer))))

      expect(sent[0]?.payload).toEqual({ integration: "search-api", name: "MCP server", settings: {}, auth: "none" })
    })
  )

  it.effect("sends the request key of an earlier attempt again, so that the host gives back what it made", () =>
    Effect.gen(function* () {
      const { message, sent } = yield* add({ status: 201, body: created }, Option.some(key))

      expect(sent.map(({ key }) => key)).toEqual(["key-1"])
      expect(message).toEqual(Message.AddedConnection({ connectionId: created.id as never, name: "MCP server" }))
    })
  )

  it.effect("says what is wrong with a name or a key that can't be one without asking the host", () =>
    Effect.gen(function* () {
      const blankName = yield* add({ status: 201, body: created }, Option.some(key), { name: "   " })
      const blankKey = yield* add({ status: 201, body: created }, Option.none(), { apiKey: "   " })

      expect(blankName.sent).toEqual([])
      expect(blankName.message).toEqual(
        Message.FailedAddConnection({ key: Option.some(key), failure: failureOfReason("Create", "Invalid") })
      )
      expect(blankKey.sent).toEqual([])
      expect(blankKey.message).toEqual(
        Message.FailedAddConnection({ key: Option.none(), failure: failureOfReason("Create", "Invalid") })
      )
    })
  )

  for (const [description, answer, reason, words] of refusals) {
    it.effect(`reports the request key it sent with a failure for ${reason} when ${description}`, () =>
      Effect.gen(function* () {
        const { message, sent } = yield* add(answer, Option.some(key))

        expect(sent.map(({ key }) => key)).toEqual(["key-1"])
        expect(message).toEqual(
          Message.FailedAddConnection({ key: Option.some(key), failure: failureOfReason("Create", reason, words) })
        )
      })
    )
  }

  it.effect("reports the request key it made when the host could not be reached, for the next try to send again", () =>
    Effect.gen(function* () {
      const { message, sent } = yield* add("unreachable", Option.none())

      expect(sent).toHaveLength(1)
      expect(message).toEqual(
        Message.FailedAddConnection({
          key: Option.some(Request.Key.make(sent[0]?.key ?? "")),
          failure: failureOfReason("Create", "Failed")
        })
      )
      expect(sent[0]?.key).toMatch(/^[\da-f-]{36}$/)
    })
  )
})

describe("ReplaceConnectionKey", () => {
  const replace = (answer: Answer, apiKey: string) => {
    const { sent, layer } = hostAnswering(answer)
    return ReplaceConnectionKey({ workspaceId, connectionId: search.id, apiKey }).effect.pipe(
      Effect.provide(ReplaceConnectionKey.layer.pipe(Layer.provideMerge(layer))),
      Effect.map((message) => ({ message, sent }))
    )
  }

  it.effect("sends the new key, ignoring the space around it, and reports the connection", () =>
    Effect.gen(function* () {
      const { message, sent } = yield* replace({ status: 200, body: created }, "  sk-new ")

      expect(sent.map(({ path }) => path)).toEqual(["/connections/connection-2/key"])
      expect(sent[0]?.payload).toEqual({ apiKey: "sk-new" })
      expect(message).toEqual(Message.ReplacedConnectionKey({ connectionId: search.id }))
    })
  )

  it.effect("says a blank key is not one without asking the host", () =>
    Effect.gen(function* () {
      const { message, sent } = yield* replace({ status: 200, body: created }, "   ")

      expect(sent).toEqual([])
      expect(message).toEqual(
        Message.FailedReplaceConnectionKey({
          connectionId: search.id,
          failure: failureOfReason("ReplaceKey", "Invalid")
        })
      )
    })
  )

  for (const [description, answer, reason, words] of refusals) {
    it.effect(`says the key could not be replaced for ${reason} when ${description}`, () =>
      Effect.gen(function* () {
        const { message } = yield* replace(answer, "sk-new")

        expect(message).toEqual(
          Message.FailedReplaceConnectionKey({
            connectionId: search.id,
            failure: failureOfReason("ReplaceKey", reason, words)
          })
        )
      })
    )
  }
})

describe("RemoveConnection", () => {
  it.effect("writes the removal, and reports that the store kept it", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()
      const message = yield* RemoveConnection({ ...asMember, connectionId: search.id }).effect.pipe(
        Effect.provide(Layer.provide(RemoveConnection.layer, layer))
      )

      expect(written).toEqual([{ action: "ConnectionRemoved", payload: { connectionId: search.id } }])
      expect(message).toEqual(Message.WroteAction({ written: Written.Remove({ connectionId: search.id }) }))
    })
  )
})

describe("FocusField", () => {
  it.effect("moves focus to the field, and completes all the same when it is not there", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const input = yield* Effect.acquireRelease(
          Effect.sync(() => {
            const element = document.createElement("input")
            element.id = "add-connection-name"
            document.body.append(element)
            return element
          }),
          (element) => Effect.sync(() => element.remove())
        )

        const focused = yield* FocusField({ id: "add-connection-name" }).effect.pipe(Effect.provide(FocusField.layer))
        const missing = yield* FocusField({ id: "no-such-field" }).effect.pipe(Effect.provide(FocusField.layer))

        expect(document.activeElement).toBe(input)
        expect(focused).toEqual(Message.CompletedFocusField())
        expect(missing).toEqual(Message.CompletedFocusField())
      })
    )
  )
})
