import { GroupMembership } from "@amends-dev/core/group";
import { Store } from "@amends-dev/core/journal";
import { Thread, ThreadParticipation, ThreadParticipationStore } from "@amends-dev/core/thread";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { compareBinary, Rows } from "./rows.ts";

const validate = Schema.decodeEffect(Schema.toType(ThreadParticipation.Record));
export const rows = Rows.make(Schema.fromJsonString(ThreadParticipation.Record));
const byId = (left: ThreadParticipation.Record, right: ThreadParticipation.Record) =>
  compareBinary(left.id, right.id);

/** Workspace-bound thread-participations projection storage. @category constructors */
export const make = Effect.fn("ThreadParticipations.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  const all = Effect.flatMap(read, (space) => rows.all(space.records.threadParticipations));

  return ThreadParticipationStore.Service.of({
    get: Effect.fn("ThreadParticipations.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(ThreadParticipation.Id)(input);
        return yield* rows.get((yield* read).records.threadParticipations, id);
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "get")),
    ),
    getMany: Effect.fn("ThreadParticipations.getMany")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(ThreadParticipation.Id))(input);
        return yield* rows.getMany((yield* read).records.threadParticipations, ids);
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "getMany")),
    ),
    listByThread: Effect.fn("ThreadParticipations.listByThread")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Thread.Id)(input);
        return (yield* all).filter((record) => record.threadId === id).toSorted(byId);
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "listByThread")),
    ),
    pageActiveByThread: Effect.fn("ThreadParticipations.pageActiveByThread")(
      function* (threadInput, input) {
        const id = yield* Schema.decodeEffect(Thread.Id)(threadInput);
        const options = yield* Schema.decodeEffect(ThreadParticipation.ListOptions)(input);
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
      function* (threadInput, input) {
        const id = yield* Schema.decodeEffect(Thread.Id)(threadInput);
        const references = yield* Schema.decodeEffect(Schema.Array(ThreadParticipation.Reference))(
          input,
        );
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
    endByAdmission: Effect.fn("ThreadParticipations.endByAdmission")(function* (input, time) {
      yield* Store.Transaction;
      const id = yield* Schema.decodeEffect(GroupMembership.Id)(input).pipe(
        Effect.mapError(storeConflict(ThreadParticipationStore, "endByAdmission")),
      );
      const endedAt = yield* Schema.decodeEffect(Schema.toType(Schema.DateTimeUtcFromString))(
        time,
      ).pipe(Effect.mapError(storeConflict(ThreadParticipationStore, "endByAdmission")));
      const space = yield* write.pipe(
        Effect.mapError(storeFailure(ThreadParticipationStore, "endByAdmission")),
      );
      const records = yield* rows
        .all(space.records.threadParticipations)
        .pipe(Effect.mapError(storeFailure(ThreadParticipationStore, "endByAdmission")));
      for (const record of records) {
        if (
          record.status !== "active" ||
          !ThreadParticipation.Participant.isAnyOf(["Member"])(record.participant) ||
          record.participant.groupMembershipId !== id
        )
          continue;
        const row = yield* rows
          .encode({ ...record, status: "ended", endedAt })
          .pipe(Effect.mapError(storeFailure(ThreadParticipationStore, "endByAdmission")));
        space.records.threadParticipations.set(record.id, row);
      }
    }),
    end: Effect.fn("ThreadParticipations.end")(function* (input, time) {
      yield* Store.Transaction;
      const departure = yield* Schema.decodeEffect(ThreadParticipation.Departure)(input).pipe(
        Effect.mapError(storeConflict(ThreadParticipationStore, "end")),
      );
      const endedAt = yield* Schema.decodeEffect(Schema.toType(Schema.DateTimeUtcFromString))(
        time,
      ).pipe(Effect.mapError(storeConflict(ThreadParticipationStore, "end")));
      if (departure.workspaceId !== workspaceId)
        return yield* new ThreadParticipationStore.Conflict({
          operation: "end",
          message: "Departure belongs to another workspace",
        });
      const space = yield* write.pipe(
        Effect.mapError(storeFailure(ThreadParticipationStore, "end")),
      );
      const current = yield* rows
        .get(space.records.threadParticipations, departure.participationId)
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
      space.records.threadParticipations.set(departure.participationId, row);
    }),
    insert: Effect.fn("ThreadParticipations.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validate(input).pipe(
        Effect.mapError(storeConflict(ThreadParticipationStore, "insert")),
      );
      if (
        record.workspaceId !== workspaceId ||
        record.status !== "active" ||
        record.endedAt !== null
      )
        return yield* new ThreadParticipationStore.Conflict({
          operation: "insert",
          message: "Invalid initial record or workspace",
        });
      const space = yield* write.pipe(
        Effect.mapError(storeFailure(ThreadParticipationStore, "insert")),
      );
      const participations = yield* rows
        .all(space.records.threadParticipations)
        .pipe(Effect.mapError(storeFailure(ThreadParticipationStore, "insert")));
      const key = ThreadParticipation.keyOf(record.participant);
      if (
        space.records.threadParticipations.has(record.id) ||
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
      space.records.threadParticipations.set(record.id, row);
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadParticipationStore.Service, make());
export * as ThreadParticipations from "./thread-participations.ts";
