import { SessionStateStore } from "@amends-dev/core/turn";
import { and, eq, sql } from "drizzle-orm";
import { Array, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeFailure } from "./errors.ts";
import { sessionStates } from "./schema.ts";

const decodeSaved = Schema.decodeUnknownEffect(SessionStateStore.Saved);

type Row = typeof sessionStates.$inferSelect;

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
      ...(row.modelEffort === null ? {} : { effort: row.modelEffort }),
    },
    sandbox: row.sandboxConnectionId === null ? null : { connectionId: row.sandboxConnectionId },
  },
});

/**
 * What the agent returned, as its column holds it: JSON, even when it is JSON's `null`, which
 * the column's SQL NULL would otherwise take for none.
 */
const agentStateColumn = (agentState: Schema.Json | undefined) =>
  agentState === undefined ? null : sql`${JSON.stringify(agentState)}::jsonb`;

/**
 * Each participation's harness session in the workspace's database; writes join the commit that
 * ends the turn.
 *
 * @category constructors
 */
export const make = Effect.fn("SessionStates.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const ofParticipation = (participationId: string) =>
    and(
      eq(sessionStates.workspaceId, workspaceId),
      eq(sessionStates.participationId, participationId),
    );
  const driver: SessionStateStore.Interface = {
    get: Effect.fn("SessionStates.get")(
      function* (participationId) {
        const rows = yield* guard(
          db.select().from(sessionStates).where(ofParticipation(participationId)),
        );
        const found = Array.head(rows);
        if (Option.isNone(found)) return Option.none();
        return Option.some(yield* decodeSaved(savedOf(found.value)));
      },
      Effect.mapError(storeFailure(SessionStateStore, "get")),
    ),
    set: Effect.fn("SessionStates.set")(
      function* (participationId, saved) {
        const { selection } = saved;
        const columns = {
          agent: saved.agent,
          agentState: agentStateColumn(saved.agentState),
          promptedThroughSequence: saved.promptedThroughSequence,
          harnessConnectionId: selection.harness.connectionId,
          modelConnectionId: selection.model.connectionId,
          modelId: selection.model.id,
          modelEffort: selection.model.effort ?? null,
          sandboxConnectionId: selection.sandbox?.connectionId ?? null,
        };
        yield* guard(
          db
            .insert(sessionStates)
            .values({ workspaceId, participationId, ...columns })
            .onConflictDoUpdate({
              target: [sessionStates.workspaceId, sessionStates.participationId],
              set: columns,
            }),
          true,
        );
      },
      Effect.mapError(storeFailure(SessionStateStore, "set")),
    ),
  };
  return SessionStateStore.make(driver);
});

/** Provide session storage over the caller's binding. @category layers */
export const layer = Layer.effect(SessionStateStore.Service, make());

export * as SessionStates from "./session-states.ts";
