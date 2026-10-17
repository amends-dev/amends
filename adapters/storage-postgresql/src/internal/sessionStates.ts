/**
 * The PostgreSQL driver for `SessionStateStore.SessionStateStore`, over the `session_states`
 * table: each participation's harness session as its last turn left it, with what it ran on as
 * columns and what the agent returned of its own as JSON. The table lies outside the read models,
 * so rebuilds keep it. `SessionStateStore.make` checks every input before the driver sees it, so
 * the driver keeps only what storage keeps: `set` replaces a participation's session in one upsert,
 * joining the commit that ends the turn. Every statement is scoped to the binding's workspace and
 * runs under its `guard`, which lets a read join the caller's transaction and requires one for a
 * write.
 */

import { StoreError } from "@amends-dev/core/journal"
import { SessionStateStore } from "@amends-dev/core/turn"
import { and, eq, sql } from "drizzle-orm"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Binding from "./binding.ts"
import { sessionStates } from "./schema.ts"

const decodeSaved = Schema.decodeUnknownEffect(SessionStateStore.Saved)

type Row = typeof sessionStates.$inferSelect

/** The session a row stores, before its fields are checked. */
const savedOf = (row: Row) => ({
  agent: row.agent,
  ...(row.agentState === null ? {} : { agentState: row.agentState }),
  promptedThroughSequence: row.promptedThroughSequence,
  selection: {
    harness: { connectionId: row.harnessConnectionId },
    model: {
      connectionId: row.modelConnectionId,
      id: row.modelId,
      ...(row.modelEffort === null ? {} : { effort: row.modelEffort })
    },
    sandbox: row.sandboxConnectionId === null ? null : { connectionId: row.sandboxConnectionId }
  }
})

/**
 * What the agent returned, as its column holds it: JSON, even when it is JSON's `null`, which
 * the column's SQL NULL would otherwise take for none.
 */
const agentStateColumn = (agentState: Schema.Json | undefined) =>
  agentState === undefined ? null : sql`${JSON.stringify(agentState)}::jsonb`

/**
 * Each participation's harness session in the workspace's database; writes join the commit that
 * ends the turn.
 */
export const make = Effect.gen(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding
  const { db } = database
  const ofParticipation = (participationId: string) =>
    and(eq(sessionStates.workspaceId, workspaceId), eq(sessionStates.participationId, participationId))
  const driver: SessionStateStore.SessionStateStore["Service"] = {
    get: Effect.fn("SessionStates.get")(
      function* (participationId) {
        const rows = yield* guard(db.select().from(sessionStates).where(ofParticipation(participationId)))
        const found = Array.head(rows)
        if (Option.isNone(found)) return Option.none()
        return Option.some(yield* decodeSaved(savedOf(found.value)))
      },
      Effect.mapError(StoreError.failed("SessionStateStore", "get"))
    ),
    set: Effect.fn("SessionStates.set")(
      function* (participationId, saved) {
        const { selection } = saved
        const columns = {
          agent: saved.agent,
          agentState: agentStateColumn(saved.agentState),
          promptedThroughSequence: saved.promptedThroughSequence,
          harnessConnectionId: selection.harness.connectionId,
          modelConnectionId: selection.model.connectionId,
          modelId: selection.model.id,
          modelEffort: selection.model.effort ?? null,
          sandboxConnectionId: selection.sandbox?.connectionId ?? null
        }
        yield* guard(
          db
            .insert(sessionStates)
            .values({ workspaceId, participationId, ...columns })
            .onConflictDoUpdate({
              target: [sessionStates.workspaceId, sessionStates.participationId],
              set: columns
            }),
          true
        )
      },
      Effect.mapError(StoreError.failed("SessionStateStore", "set"))
    )
  }
  return SessionStateStore.make(driver)
})

/**
 * Provides `SessionStateStore.SessionStateStore` over the caller's `Binding.Binding`.
 */
export const layer = Layer.effect(SessionStateStore.SessionStateStore, make)
