import { Session } from "@amends/harness-v2";
import { Store } from "@amends/core/journal";
import { SessionStateStore } from "@amends/core/turn";
import { and, eq } from "drizzle-orm";
import { Array, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeFailure } from "./errors.ts";
import { sessionStates } from "./schema.ts";

/** A session's state as the JSON its column holds. */
const StateJson = Schema.toCodecJson(Session.SessionState);
const encodeState = Schema.encodeEffect(StateJson);
const decodeSaved = Schema.decodeUnknownEffect(
  Schema.Struct({ ...SessionStateStore.Saved.fields, state: StateJson }),
);

type Row = typeof sessionStates.$inferSelect;

/** The session a row stores, before its fields are checked. */
const savedOf = (row: Row) => ({
  state: row.state,
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
  return SessionStateStore.Service.of({
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
        yield* Store.Transaction;
        const { selection } = saved;
        const columns = {
          state: yield* encodeState(saved.state),
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
  });
});

/** Provide session storage over the caller's binding. @category layers */
export const layer = Layer.effect(SessionStateStore.Service, make());

export * as SessionStates from "./session-states.ts";
