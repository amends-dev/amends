import { expect, it } from "@effect/vitest"
import { DateTime, Effect, Exit, Option } from "effect"
import * as Agent from "../../src/agent/Agent.ts"
import * as AgentFacts from "../../src/agent/AgentFacts.ts"
import * as AgentProjection from "../../src/agent/AgentProjection.ts"
import * as AgentStore from "../../src/agent/AgentStore.ts"
import * as Connection from "../../src/connection/Connection.ts"
import * as Checkpoint from "../../src/journal/Checkpoint.ts"
import * as Entry from "../../src/journal/Entry.ts"
import * as Journal from "../../src/journal/Journal.ts"
import * as Log from "../../src/journal/Log.ts"
import * as Publication from "../../src/journal/Publication.ts"
import * as Store from "../../src/journal/Store.ts"
import * as StoreError from "../../src/journal/StoreError.ts"
import * as Member from "../../src/workspace/Member.ts"
import * as Workspace from "../../src/workspace/Workspace.ts"
import { make } from "../memory.ts"
import { testProvenance } from "../publication.ts"

const workspaceId = Workspace.Id.make("workspace-one")
const logId = Entry.LogId.make("workspace-one/journal")

const created: Agent.Agent = {
  id: Agent.Id.make("agent-one"),
  workspaceId,
  memberId: Member.Id.make("member-agent"),
  instructions: "Review each change.",
  harness: { _tag: "Auto" },
  model: { connectionId: Connection.Id.make("conn-models"), id: "claude-opus-5-5" },
  sandbox: null,
  createdBy: Member.Id.make("member-owner"),
  createdAt: DateTime.makeUnsafe("2026-10-06T12:00:00.000Z")
}

/** Agents in memory, refusing a reused id and a missing one as storage does. */
const agentsInMemory = () => {
  const records = new Map<string, Agent.Agent>()
  const conflict = (operation: string, message: string) =>
    Effect.fail(StoreError.rejected("AgentStore", operation, message))
  return AgentStore.AgentStore.of({
    get: (id) => Effect.sync(() => Option.fromNullishOr(records.get(id))),
    list: Effect.sync(() => [...records.values()]),
    insert: (record) =>
      records.has(record.id)
        ? conflict("insert", "The agent exists")
        : Effect.sync(() => void records.set(record.id, record)),
    update: (record) =>
      records.has(record.id)
        ? Effect.sync(() => void records.set(record.id, record))
        : conflict("update", "The agent is missing")
  })
}

/** Publishes in one commit, projecting agents into `agentStore`. */
const commit = (
  agentStore: AgentStore.AgentStore["Service"],
  publish: (journal: Journal.Journal["Service"]) => Effect.Effect<unknown, unknown, Publication.Publication>
) =>
  Effect.gen(function* () {
    const fixture = yield* make()
    yield* Effect.gen(function* () {
      const journal = yield* Journal.make({ logId, projections: [AgentProjection.definition] })
      yield* journal.commit(publish(journal))
    }).pipe(
      Effect.provideService(Publication.Publication, testProvenance(workspaceId)),
      Effect.provide(Log.layer),
      Effect.provideService(Store.Store, fixture.store),
      Effect.provideService(Checkpoint.Checkpoint, fixture.checkpoints),
      Effect.provideService(AgentStore.AgentStore, agentStore)
    )
  })

it.effect("records an agent, and replaces how it is set up as a whole", () =>
  Effect.gen(function* () {
    const agentStore = agentsInMemory()
    const configured = {
      instructions: "Review each change, then test it.",
      harness: { _tag: "Connection", connectionId: Connection.Id.make("conn-opencode") },
      model: {
        connectionId: Connection.Id.make("conn-models"),
        id: "claude-sonnet-5-5",
        effort: "high"
      },
      sandbox: { connectionId: Connection.Id.make("conn-daytona") }
    } as const

    yield* commit(agentStore, (journal) =>
      Effect.gen(function* () {
        yield* journal.publish(AgentFacts.Created, created)
        expect(yield* agentStore.get(created.id)).toEqual(Option.some(created))
        yield* journal.publish(AgentFacts.Configured, {
          workspaceId,
          agentId: created.id,
          memberId: created.memberId,
          ...configured
        })
      })
    )

    expect(yield* agentStore.list).toEqual([Agent.change(created, configured)])
  })
)

it.effect("dies on a change to an agent it never recorded", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      commit(agentsInMemory(), (journal) =>
        journal.publish(AgentFacts.Configured, {
          workspaceId,
          agentId: created.id,
          memberId: created.memberId,
          instructions: created.instructions,
          harness: created.harness,
          model: created.model,
          sandbox: created.sandbox
        })
      )
    )

    expect(Exit.hasDies(exit)).toBe(true)
  })
)
