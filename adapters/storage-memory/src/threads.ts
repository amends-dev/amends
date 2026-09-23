import { Group } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Thread, ThreadStore } from "@amends/core/thread";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { compareBinary, Rows } from "./rows.ts";

const validate = Schema.decodeEffect(Schema.toType(Thread.Record));
const rows = Rows.make(Schema.fromJsonString(Thread.Record));
const latestRows = Rows.make(Schema.fromJsonString(Thread.Latest));

/** Newest latest activity first, then ID in descending binary order. */
const newestFirst = (
  left: { readonly at: number; readonly id: string },
  right: { readonly at: number; readonly id: string },
) => right.at - left.at || compareBinary(right.id, left.id);

/** Workspace-bound threads projection storage. @category constructors */
export const make = Effect.fn("Threads.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  const inGroup = Effect.fnUntraced(function* (groupId: Group.Id) {
    const records = yield* rows.all((yield* read).records.threads);
    return records.filter((record) => record.groupId === groupId);
  });
  return ThreadStore.Service.of({
    workspaceId,
    get: Effect.fn("Threads.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Thread.Id)(input);
        return yield* rows.get((yield* read).records.threads, id);
      },
      Effect.mapError(storeFailure(ThreadStore, "get")),
    ),
    listByGroup: Effect.fn("Threads.listByGroup")(
      function* (input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(input);
        return (yield* inGroup(groupId)).toSorted((left, right) =>
          compareBinary(left.id, right.id),
        );
      },
      Effect.mapError(storeFailure(ThreadStore, "listByGroup")),
    ),
    listByLatest: Effect.fn("Threads.listByLatest")(
      function* (groupInput, input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput);
        const options = yield* Schema.decodeEffect(Schema.toType(Thread.ListOptions))(input);
        const threads = yield* inGroup(groupId);
        const latest = new Map(
          (yield* latestRows.getMany(
            (yield* read).records.threadLatest,
            threads.map((thread) => thread.id),
          )).map((value) => [value.threadId, DateTime.toEpochMillis(value.occurredAt)]),
        );
        const before = Option.fromUndefinedOr(options.before).pipe(
          Option.map((cursor) => ({
            at: DateTime.toEpochMillis(cursor.latestActivityAt),
            id: cursor.threadId,
          })),
        );
        return threads
          .flatMap((thread) => {
            const at = latest.get(thread.id);
            return at === undefined ? [] : [{ thread, at, id: thread.id }];
          })
          .filter((entry) => Option.isNone(before) || newestFirst(entry, before.value) > 0)
          .toSorted(newestFirst)
          .slice(0, options.limit)
          .map(({ thread }) => thread);
      },
      Effect.mapError(storeFailure(ThreadStore, "listByLatest")),
    ),
    getLatest: Effect.fn("Threads.getLatest")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(Thread.Id))(input);
        return yield* latestRows.getMany((yield* read).records.threadLatest, ids);
      },
      Effect.mapError(storeFailure(ThreadStore, "getLatest")),
    ),
    recordLatest: Effect.fn("Threads.recordLatest")(function* (input) {
      yield* Store.Transaction;
      const latest = yield* Schema.decodeEffect(Schema.toType(Thread.Latest))(input).pipe(
        Effect.mapError(storeConflict(ThreadStore, "recordLatest")),
      );
      const space = yield* write.pipe(Effect.mapError(storeFailure(ThreadStore, "recordLatest")));
      if (!space.records.threads.has(latest.threadId))
        return yield* new ThreadStore.Conflict({
          operation: "recordLatest",
          message: "Thread is missing",
        });
      const current = yield* latestRows
        .get(space.records.threadLatest, latest.threadId)
        .pipe(Effect.mapError(storeFailure(ThreadStore, "recordLatest")));
      // Only a later position advances; an earlier one changes nothing.
      if (Option.isSome(current) && latest.sequence <= current.value.sequence) return;
      const row = yield* latestRows
        .encode(latest)
        .pipe(Effect.mapError(storeFailure(ThreadStore, "recordLatest")));
      space.records.threadLatest.set(latest.threadId, row);
    }),
    insert: Effect.fn("Threads.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validate(input).pipe(
        Effect.mapError(storeConflict(ThreadStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new ThreadStore.Conflict({
          operation: "insert",
          message: "Invalid initial record or workspace",
        });
      const space = yield* write.pipe(Effect.mapError(storeFailure(ThreadStore, "insert")));
      const creator = record.createdBy;
      if (
        !space.records.groups.has(record.groupId) ||
        (creator._tag === "Member" && !space.records.members.has(creator.memberId))
      )
        return yield* new ThreadStore.Conflict({
          operation: "insert",
          message: "Missing or inconsistent references",
        });
      if (space.records.threads.has(record.id))
        return yield* new ThreadStore.Conflict({
          operation: "insert",
          message: "Thread ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ThreadStore, "insert")));
      space.records.threads.set(record.id, row);
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadStore.Service, make());
export * as Threads from "./threads.ts";
