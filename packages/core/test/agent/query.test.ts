import {
  type Connection as ConnectionContract,
  Integration,
  Integrations,
  type ModelCatalog
} from "@amends-dev/connection"
import { Harness } from "@amends-dev/harness"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Layer, Option, Redacted, Result } from "effect"
import * as Agent from "../../src/agent/Agent.ts"
import * as AgentQuery from "../../src/agent/AgentQuery.ts"
import * as AgentStore from "../../src/agent/AgentStore.ts"
import * as Connection from "../../src/connection/Connection.ts"
import * as ConnectionCredentialStore from "../../src/connection/ConnectionCredentialStore.ts"
import * as ConnectionStore from "../../src/connection/ConnectionStore.ts"
import * as CoreError from "../../src/error/CoreError.ts"
import * as Identity from "../../src/identity/Identity.ts"
import * as Member from "../../src/workspace/Member.ts"
import * as MemberStore from "../../src/workspace/MemberStore.ts"
import * as Workspace from "../../src/workspace/Workspace.ts"

const workspaceId = Workspace.Id.make("workspace-one")

const listed: ModelCatalog.Model = {
  id: "model-one",
  name: "Model One",
  protocol: "openai-chat",
  url: "https://models.example/v1",
  released: "2026-01",
  limits: { context: 100_000, output: 8_000 },
  modalities: { input: ["text"], output: ["text"] },
  tools: true,
  reasoning: { toggle: false, efforts: ["low", "high"] }
}

/** A harness of an agent named `id`, which no test makes. */
const harnessOf = (id: string, requiresSandbox: boolean) => () =>
  Effect.succeed(
    Harness.make({
      id,
      requiresSandbox,
      createSession: () => Effect.die("No test starts a session")
    })
  )

const installed = Integrations.make([
  Integration.make({
    id: "in-process",
    name: "In process",
    auth: ["none"],
    harnesses: { requiresSandbox: false, harness: harnessOf("in-process", false) },
    check: () => Effect.succeed({ status: "healthy" })
  }),
  Integration.make({
    id: "boxed",
    name: "Boxed",
    auth: ["none"],
    harnesses: { requiresSandbox: true, harness: harnessOf("boxed", true) },
    check: () => Effect.succeed({ status: "healthy" })
  }),
  Integration.make({
    id: "models",
    name: "Models",
    auth: ["apiKey"],
    models: {
      listed: [listed],
      unlisted: false,
      endpoint: ({ apiKey }, { model, effort }) =>
        Result.succeed({
          provider: "models",
          model,
          protocol: "openai-chat",
          url: "https://models.example/v1",
          apiKey,
          ...(effort === undefined ? {} : { effort })
        })
    },
    check: () => Effect.succeed({ status: "healthy" })
  }),
  Integration.make({
    id: "boxes",
    name: "Boxes",
    auth: ["none"],
    sandboxes: () => Effect.die("No test makes a sandbox"),
    check: () => Effect.succeed({ status: "healthy" })
  })
])

const connection = (
  id: string,
  integration: string,
  createdAt: string,
  auth: ConnectionContract.AuthMethod = "none"
): Connection.Connection => ({
  id: Connection.Id.make(id),
  workspaceId,
  integration,
  name: id,
  settings: {},
  auth,
  status: "active",
  createdBy: Member.Id.make("member-owner"),
  createdAt: DateTime.makeUnsafe(createdAt)
})

const inProcess = connection("conn-in-process", "in-process", "2026-10-06T12:00:00.000Z")
const laterInProcess = connection("conn-later", "in-process", "2026-10-06T13:00:00.000Z")
const boxed = connection("conn-boxed", "boxed", "2026-10-06T11:00:00.000Z")
const models = connection("conn-models", "models", "2026-10-06T12:00:00.000Z", "apiKey")
const boxes = connection("conn-boxes", "boxes", "2026-10-06T12:00:00.000Z")

const agentMemberId = Member.Id.make("member-agent")
const agentId = Agent.Id.make("agent-one")

const agent = (fields: Partial<Agent.Agent> = {}): Agent.Agent => ({
  id: agentId,
  workspaceId,
  memberId: agentMemberId,
  instructions: "Review each change.",
  harness: { _tag: "Connection", connectionId: inProcess.id },
  model: { connectionId: models.id, id: "model-one", effort: "high" },
  sandbox: null,
  createdBy: Member.Id.make("member-owner"),
  createdAt: DateTime.makeUnsafe("2026-10-06T12:00:00.000Z"),
  ...fields
})

interface World {
  readonly agent?: Agent.Agent
  readonly members?: ReadonlyArray<Member.Member>
  readonly connections?: ReadonlyArray<Connection.Connection>
  readonly keys?: ReadonlyMap<Connection.Id, string>
  /** Why this host keeps no credentials, when it keeps none. */
  readonly credentialsUnavailable?: string
}

/** The agent's membership, active unless `status` says otherwise. */
const agentMember = (status: Member.Status = "active"): Member.Member => ({
  id: agentMemberId,
  workspaceId,
  identity: { _tag: "Agent", id: agentId },
  name: Member.Name.make("Reviewer"),
  status
})

/** The query over a workspace holding what `world` says, by default the agent and every connection. */
const queryIn = (world: World = {}) => {
  const record = world.agent ?? agent()
  const members = new Map((world.members ?? [agentMember()]).map((member) => [member.id, member]))
  const connections = world.connections ?? [inProcess, laterInProcess, boxed, models, boxes]
  const keys = world.keys ?? new Map([[models.id, "sk-models"]])
  const unused = (what: string) => () => Effect.die(`No test ${what}`)
  const stores = Layer.mergeAll(
    Layer.succeed(MemberStore.MemberStore, {
      get: (memberId) => Effect.succeed(Option.fromUndefinedOr(members.get(memberId))),
      getMany: unused("reads several members"),
      findActive: unused("finds a membership"),
      list: Effect.die("No test lists members"),
      insert: unused("adds a member"),
      rename: unused("renames a member"),
      markRemoved: unused("removes a member")
    }),
    Layer.succeed(AgentStore.AgentStore, {
      get: (id) => Effect.succeed(id === record.id ? Option.some(record) : Option.none()),
      list: Effect.succeed([record]),
      insert: unused("adds an agent"),
      update: unused("changes an agent")
    }),
    Layer.succeed(ConnectionStore.ConnectionStore, {
      get: (id) => Effect.succeed(Option.fromUndefinedOr(connections.find((found) => found.id === id))),
      listActive: Effect.succeed(connections),
      insert: unused("adds a connection"),
      update: unused("changes a connection")
    }),
    Layer.succeed(ConnectionCredentialStore.ConnectionCredentialStore, {
      set: unused("stores a key"),
      get: (connectionId) => {
        if (world.credentialsUnavailable !== undefined) {
          return Effect.fail(
            new CoreError.Unavailable({
              reason: new CoreError.CredentialsUnavailable({
                description: world.credentialsUnavailable
              })
            })
          )
        }
        const key = keys.get(connectionId)
        return Effect.succeed(key === undefined ? Option.none() : Option.some({ apiKey: Redacted.make(key) }))
      },
      remove: unused("removes a key")
    }),
    Layer.effect(Integrations.Integrations, installed)
  )
  return AgentQuery.make.pipe(Effect.provide(stores))
}

const selection = (fields: Partial<Agent.Selection> = {}): Agent.Selection => ({
  harness: { connectionId: inProcess.id },
  model: { connectionId: models.id, id: "model-one", effort: "high" },
  sandbox: null,
  ...fields
})

describe("what an agent runs a turn on", () => {
  it.effect("is the agent's own harness, model, and sandbox", () =>
    Effect.gen(function* () {
      const agentQuery = yield* queryIn({
        agent: agent({
          harness: { _tag: "Connection", connectionId: boxed.id },
          sandbox: { connectionId: boxes.id }
        })
      })

      expect(yield* agentQuery.select(agentMemberId, undefined)).toEqual(
        selection({ harness: { connectionId: boxed.id }, sandbox: { connectionId: boxes.id } })
      )
    })
  )

  it.effect("on Auto, is the harness its last turn ran on while it can, and otherwise the oldest", () =>
    Effect.gen(function* () {
      const onAuto = agent({ harness: { _tag: "Auto" } })
      const agentQuery = yield* queryIn({ agent: onAuto })
      const withoutLater = yield* queryIn({ agent: onAuto, connections: [inProcess, models] })
      const last = selection({ harness: { connectionId: laterInProcess.id } })

      // The boxed harness is older, but its agent works only in a sandbox, which this one lacks.
      expect(yield* agentQuery.select(agentMemberId, undefined)).toEqual(selection())
      expect(yield* agentQuery.select(agentMemberId, last)).toEqual(last)
      expect(yield* withoutLater.select(agentMemberId, last)).toEqual(selection())
    })
  )

  it.effect("cannot be chosen for an agent that cannot run", () =>
    Effect.gen(function* () {
      const modelGone = yield* queryIn({ connections: [inProcess] })
      const noHarness = yield* queryIn({
        agent: agent({ harness: { _tag: "Auto" } }),
        connections: [boxed, models]
      })

      expect(yield* Effect.flip(modelGone.select(agentMemberId, undefined))).toMatchObject({
        _tag: "CoreError.Invalid",
        reason: { _tag: "Incomplete", issues: [{ _tag: "Removed", part: "model" }] }
      })
      expect(yield* Effect.flip(noHarness.select(agentMemberId, undefined))).toMatchObject({
        _tag: "CoreError.Invalid",
        reason: { _tag: "Incomplete", issues: [{ _tag: "NoHarness" }] }
      })
    })
  )

  it.effect("is not found for a person, or an agent whose membership ended", () =>
    Effect.gen(function* () {
      const person: Member.Member = {
        id: Member.Id.make("member-person"),
        workspaceId,
        identity: { _tag: "Human", id: Identity.HumanId.make("alice") },
        name: Member.Name.make("alice"),
        status: "active"
      }
      const agentQuery = yield* queryIn({
        members: [person, agentMember("removed")]
      })

      for (const memberId of [person.id, agentMemberId]) {
        expect(yield* Effect.flip(agentQuery.select(memberId, undefined))).toEqual(
          new CoreError.NotFound({ resource: "Agent", id: memberId })
        )
      }
    })
  )
})

describe("an agent ready to run", () => {
  it.effect("has its instructions, and each connection of its selection with its key", () =>
    Effect.gen(function* () {
      const agentQuery = yield* queryIn()

      const runnable = yield* agentQuery.buildRunnable(
        agentMemberId,
        selection({ harness: { connectionId: boxed.id }, sandbox: { connectionId: boxes.id } })
      )

      expect(runnable).toMatchObject({
        instructions: "Review each change.",
        harness: { connection: { id: boxed.id, integration: "boxed" }, credential: null },
        model: {
          connection: { id: models.id, integration: "models", auth: "apiKey" },
          model: { connectionId: models.id, id: "model-one", effort: "high" }
        },
        sandbox: { connection: { id: boxes.id, integration: "boxes" }, credential: null }
      })
      expect(Redacted.value(runnable.model.credential?.apiKey ?? Redacted.make(""))).toBe("sk-models")
    })
  )

  it.effect("has no sandbox for an agent that works without one", () =>
    Effect.gen(function* () {
      const agentQuery = yield* queryIn()

      const runnable = yield* agentQuery.buildRunnable(agentMemberId, selection())

      expect(runnable.harness.connection.integration).toBe("in-process")
      expect(runnable.sandbox).toBeNull()
    })
  )

  it.effect("cannot be built when a connection of its selection is gone or has no key", () =>
    Effect.gen(function* () {
      const harnessGone = yield* queryIn({ connections: [models] })
      const keyless = yield* queryIn({ keys: new Map() })
      const keepsNoKeys = yield* queryIn({ credentialsUnavailable: "No key protects credentials" })

      expect(yield* Effect.flip(harnessGone.buildRunnable(agentMemberId, selection()))).toMatchObject({
        _tag: "CoreError.Invalid",
        reason: { _tag: "Incomplete", issues: [{ _tag: "Removed", part: "harness" }] }
      })
      expect(yield* Effect.flip(keyless.buildRunnable(agentMemberId, selection()))).toMatchObject({
        _tag: "CoreError.Invalid",
        reason: {
          _tag: "Incomplete",
          issues: [
            {
              _tag: "Invalid",
              part: "model",
              description: "The connection conn-models has no API key"
            }
          ]
        }
      })
      expect(yield* Effect.flip(keepsNoKeys.buildRunnable(agentMemberId, selection()))).toMatchObject({
        _tag: "CoreError.Invalid",
        reason: {
          _tag: "Incomplete",
          issues: [{ _tag: "Invalid", part: "model", description: "No key protects credentials" }]
        }
      })
    })
  )
})
