/**
 * The storage contract for participations, which every storage adapter implements and
 * `ThreadParticipationProjection` writes. Reads honor the caller's transaction when there is one;
 * writes require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Option, Schema } from "effect";
import type { DateTime } from "effect";
import * as Store from "../journal/Store.ts";
import * as ThreadParticipation from "./ThreadParticipation.ts";
import * as ThreadId from "./ThreadId.ts";
import * as GroupMembership from "../group/GroupMembership.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import { storeFailure } from "../journal/internal/store-failure.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";

/**
 * Storage failed while reading or writing participations.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("ThreadParticipationStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused ID, a second
 * active participation for one participant, or an ending that names no active participation.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("ThreadParticipationStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The participation store, bound to one workspace by the host.
 *
 * What a storage adapter implements for participations.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class ThreadParticipationStore extends Context.Service<
  ThreadParticipationStore,
  {
    readonly get: (
      id: ThreadParticipation.Id,
    ) => Effect.Effect<Option.Option<ThreadParticipation.ThreadParticipation>, Failure>;
    /**
     * Find several participations, active or ended, in one read. Absent IDs are omitted and each
     * found record appears once; order is unspecified, so callers index results by ID. An empty
     * request reads nothing.
     */
    readonly getMany: (
      ids: ReadonlyArray<ThreadParticipation.Id>,
    ) => Effect.Effect<ReadonlyArray<ThreadParticipation.ThreadParticipation>, Failure>;
    /**
     * Every participation the thread has had, active or ended, in stable ID order. A history read
     * for inspection; operations use the bounded reads below.
     */
    readonly listByThread: (
      id: ThreadId.Id,
    ) => Effect.Effect<ReadonlyArray<ThreadParticipation.ThreadParticipation>, Failure>;
    /**
     * A page of the thread's active participations in binary participation-ID order, after the
     * exclusive cursor.
     */
    readonly pageActiveByThread: (
      id: ThreadId.Id,
      options: ThreadParticipation.ListOptions,
    ) => Effect.Effect<ReadonlyArray<ThreadParticipation.ThreadParticipation>, Failure>;
    /**
     * The thread's active participations of these participants, in one read. Each found record
     * appears once; order is unspecified, so callers index results by participant. An empty
     * request reads nothing.
     */
    readonly findActive: (
      id: ThreadId.Id,
      participants: ReadonlyArray<ThreadParticipation.Reference>,
    ) => Effect.Effect<ReadonlyArray<ThreadParticipation.ThreadParticipation>, Failure>;
    /**
     * End every active participation held through this group admission at `endedAt`, however many
     * there are, in one write; ended ones keep their time. A departure from the group ends them all.
     */
    readonly endByAdmission: (
      id: GroupMembership.Id,
      endedAt: DateTime.Utc,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /** End exactly the addressed active participation; mismatched or terminal records conflict. */
    readonly end: (
      departure: ThreadParticipation.Departure,
      endedAt: DateTime.Utc,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /**
     * Reject reused IDs and a second active
     * participation for one participant in the thread. The thread and admission are recorded as
     * given, checked when the participant is admitted. Preserve historical values on replay.
     */
    readonly insert: (
      record: ThreadParticipation.ThreadParticipation,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/thread/ThreadParticipationStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: ThreadParticipationStore["Service"],
): ThreadParticipationStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", ThreadParticipation.Id, id), driver.get),
    getMany: (ids) =>
      Effect.flatMap(read("getMany", Schema.Array(ThreadParticipation.Id), ids), driver.getMany),
    listByThread: (id) =>
      Effect.flatMap(read("listByThread", ThreadId.Id, id), driver.listByThread),
    pageActiveByThread: Effect.fn("ThreadParticipationStore.pageActiveByThread")(
      function* (id, options) {
        return yield* driver.pageActiveByThread(
          yield* read("pageActiveByThread", ThreadId.Id, id),
          yield* read("pageActiveByThread", ThreadParticipation.ListOptions, options),
        );
      },
    ),
    findActive: Effect.fn("ThreadParticipationStore.findActive")(function* (id, participants) {
      return yield* driver.findActive(
        yield* read("findActive", ThreadId.Id, id),
        yield* read("findActive", Schema.Array(ThreadParticipation.Reference), participants),
      );
    }),
    endByAdmission: Effect.fn("ThreadParticipationStore.endByAdmission")(function* (id, endedAt) {
      return yield* driver.endByAdmission(
        yield* write("endByAdmission", GroupMembership.Id, id),
        yield* write("endByAdmission", Schema.DateTimeUtc, endedAt),
      );
    }),
    end: Effect.fn("ThreadParticipationStore.end")(function* (departure, endedAt) {
      return yield* driver.end(
        yield* write("end", ThreadParticipation.Departure, departure),
        yield* write("end", Schema.DateTimeUtc, endedAt),
      );
    }),
    insert: (record) =>
      write("insert", ThreadParticipation.ThreadParticipation, record).pipe(
        Effect.filterOrFail(
          (record) => record.status === "active" && record.endedAt === null,
          () => new Conflict({ operation: "insert", message: "Expected an active participation" }),
        ),
        Effect.flatMap(driver.insert),
      ),
  };
};

/**
 * How participation records are stored: the JSON of each record's encoded form, keyed by its ID.
 */
const rows = MemoryDatabase.makeRows(
  Schema.fromJsonString(ThreadParticipation.ThreadParticipation),
);
const byId = (
  left: ThreadParticipation.ThreadParticipation,
  right: ThreadParticipation.ThreadParticipation,
) => MemoryDatabase.compareBinary(left.id, right.id);

/**
 * Participations over the current workspace transaction, which `ThreadParticipationProjection`
 * writes.
 */
const makeMemory = Effect.fn("ThreadParticipationStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding;
  const all = Effect.flatMap(read, (space) => rows.all(space.records.of("threadParticipations")));

  const driver: ThreadParticipationStore["Service"] = {
    get: Effect.fn("ThreadParticipationStore.memory.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("threadParticipations"), id);
      },
      Effect.mapError(storeFailure(Failure, "get")),
    ),
    getMany: Effect.fn("ThreadParticipationStore.memory.getMany")(
      function* (ids) {
        return yield* rows.getMany((yield* read).records.of("threadParticipations"), ids);
      },
      Effect.mapError(storeFailure(Failure, "getMany")),
    ),
    listByThread: Effect.fn("ThreadParticipationStore.memory.listByThread")(
      function* (id) {
        return (yield* all).filter((record) => record.threadId === id).toSorted(byId);
      },
      Effect.mapError(storeFailure(Failure, "listByThread")),
    ),
    pageActiveByThread: Effect.fn("ThreadParticipationStore.memory.pageActiveByThread")(
      function* (id, options) {
        const after = options.after;
        return (yield* all)
          .filter(
            (record) =>
              record.threadId === id &&
              record.status === "active" &&
              (after === undefined || MemoryDatabase.compareBinary(record.id, after) > 0),
          )
          .toSorted(byId)
          .slice(0, options.limit);
      },
      Effect.mapError(storeFailure(Failure, "pageActiveByThread")),
    ),
    findActive: Effect.fn("ThreadParticipationStore.memory.findActive")(
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
      Effect.mapError(storeFailure(Failure, "findActive")),
    ),
    endByAdmission: Effect.fn("ThreadParticipationStore.memory.endByAdmission")(
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
      Effect.mapError(storeFailure(Failure, "endByAdmission")),
    ),
    end: Effect.fn("ThreadParticipationStore.memory.end")(function* (departure, endedAt) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "end")));
      const current = yield* rows
        .get(space.records.of("threadParticipations"), departure.participationId)
        .pipe(Effect.mapError(storeFailure(Failure, "end")));
      if (
        Option.isNone(current) ||
        current.value.threadId !== departure.threadId ||
        current.value.status !== "active"
      )
        return yield* new Conflict({
          operation: "end",
          message: "Participation is missing, mismatched, or already ended",
        });
      const row = yield* rows
        .encode({ ...current.value, status: "ended", endedAt })
        .pipe(Effect.mapError(storeFailure(Failure, "end")));
      space.records.of("threadParticipations").set(departure.participationId, row);
    }),
    insert: Effect.fn("ThreadParticipationStore.memory.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "insert")));
      const participations = yield* rows
        .all(space.records.of("threadParticipations"))
        .pipe(Effect.mapError(storeFailure(Failure, "insert")));
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
        return yield* new Conflict({
          operation: "insert",
          message: "Participation ID reused, or the participant already takes part",
        });
      const row = yield* rows.encode(record).pipe(Effect.mapError(storeFailure(Failure, "insert")));
      space.records.of("threadParticipations").set(record.id, row);
    }),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `ThreadParticipationStore` in process memory, over the workspace's `Store.MemoryBinding`.
 * It keeps what the contract leaves to storage: a reused ID conflicts, and so does a second active
 * participation of one participant in one thread; ending conflicts unless the participation is
 * stored, active, and in the thread named. An ended participation keeps its row. `make` checks
 * every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(ThreadParticipationStore, makeMemory());
