import { ThreadParticipation, ThreadParticipationStore } from "../thread/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeFailure } from "./errors.ts";
import { compareBinary, Rows } from "./rows.ts";

export const rows = Rows.make(Schema.fromJsonString(ThreadParticipation.Record));
const byId = (left: ThreadParticipation.Record, right: ThreadParticipation.Record) =>
  compareBinary(left.id, right.id);

/** Workspace-bound thread-participations projection storage. @category constructors */
export const make = Effect.fn("ThreadParticipations.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  const all = Effect.flatMap(read, (space) => rows.all(space.records.of("threadParticipations")));

  const driver: ThreadParticipationStore.Interface = {
    get: Effect.fn("ThreadParticipations.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("threadParticipations"), id);
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "get")),
    ),
    getMany: Effect.fn("ThreadParticipations.getMany")(
      function* (ids) {
        return yield* rows.getMany((yield* read).records.of("threadParticipations"), ids);
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "getMany")),
    ),
    listByThread: Effect.fn("ThreadParticipations.listByThread")(
      function* (id) {
        return (yield* all).filter((record) => record.threadId === id).toSorted(byId);
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "listByThread")),
    ),
    pageActiveByThread: Effect.fn("ThreadParticipations.pageActiveByThread")(
      function* (id, options) {
        const after = options.after;
        return (yield* all)
          .filter(
            (record) =>
              record.threadId === id &&
              record.status === "active" &&
              (after === undefined || compareBinary(record.id, after) > 0),
          )
          .toSorted(byId)
          .slice(0, options.limit);
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "pageActiveByThread")),
    ),
    findActive: Effect.fn("ThreadParticipations.findActive")(
      function* (id, references) {
        if (references.length === 0) return [];
        const keys = new Set(references.map(ThreadParticipation.keyOf));
        return (yield* all).filter(
          (record) =>
            record.threadId === id &&
            record.status === "active" &&
            keys.has(ThreadParticipation.keyOf(record.participant)),
        );
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "findActive")),
    ),
    endByAdmission: Effect.fn("ThreadParticipations.endByAdmission")(
      function* (id, endedAt) {
        const space = yield* write;
        const records = yield* rows.all(space.records.of("threadParticipations"));
        for (const record of records) {
          if (
            record.status !== "active" ||
            !ThreadParticipation.Participant.isAnyOf(["Member"])(record.participant) ||
            record.participant.groupMembershipId !== id
          )
            continue;
          const row = yield* rows.encode({ ...record, status: "ended", endedAt });
          space.records.of("threadParticipations").set(record.id, row);
        }
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "endByAdmission")),
    ),
    end: Effect.fn("ThreadParticipations.end")(function* (departure, endedAt) {
      const space = yield* write.pipe(
        Effect.mapError(storeFailure(ThreadParticipationStore, "end")),
      );
      const current = yield* rows
        .get(space.records.of("threadParticipations"), departure.participationId)
        .pipe(Effect.mapError(storeFailure(ThreadParticipationStore, "end")));
      if (
        Option.isNone(current) ||
        current.value.threadId !== departure.threadId ||
        current.value.status !== "active"
      )
        return yield* new ThreadParticipationStore.Conflict({
          operation: "end",
          message: "Participation is missing, mismatched, or already ended",
        });
      const row = yield* rows
        .encode({ ...current.value, status: "ended", endedAt })
        .pipe(Effect.mapError(storeFailure(ThreadParticipationStore, "end")));
      space.records.of("threadParticipations").set(departure.participationId, row);
    }),
    insert: Effect.fn("ThreadParticipations.insert")(function* (record) {
      const space = yield* write.pipe(
        Effect.mapError(storeFailure(ThreadParticipationStore, "insert")),
      );
      const participations = yield* rows
        .all(space.records.of("threadParticipations"))
        .pipe(Effect.mapError(storeFailure(ThreadParticipationStore, "insert")));
      const key = ThreadParticipation.keyOf(record.participant);
      if (
        space.records.of("threadParticipations").has(record.id) ||
        participations.some(
          (participation) =>
            participation.threadId === record.threadId &&
            participation.status === "active" &&
            ThreadParticipation.keyOf(participation.participant) === key,
        )
      )
        return yield* new ThreadParticipationStore.Conflict({
          operation: "insert",
          message: "Participation ID reused, or the participant already takes part",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ThreadParticipationStore, "insert")));
      space.records.of("threadParticipations").set(record.id, row);
    }),
  };
  return ThreadParticipationStore.make(workspaceId, driver);
});
/** @category layers */
export const layer = Layer.effect(ThreadParticipationStore.Service, make());
export * as ThreadParticipations from "./thread-participations.ts";
