/**
 * The memory implementation of `ThreadStore` from `../thread/ThreadStore.ts`, over the workspace's
 * `Binding`: thread records, and each thread's latest content activity as a row of its own. It
 * keeps what the contract leaves to storage: a reused ID conflicts; renaming or recording latest
 * activity conflicts for a missing thread; and a latest position at or before the recorded one
 * changes nothing. `ThreadStore.make` checks every input before this driver sees it.
 *
 * @since 0.1.0
 */
import { Group } from "../group/index.ts";
import { Thread, ThreadStore } from "../thread/index.ts";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";
import { compareBinary } from "./Rows.ts";

const rows = Rows.make(Schema.fromJsonString(Thread.Thread));
const latestRows = Rows.make(Schema.fromJsonString(Thread.Latest));

/** Newest time first, then ID in descending binary order. */
const newestFirst = (
  left: { readonly at: number; readonly id: string },
  right: { readonly at: number; readonly id: string },
) => right.at - left.at || compareBinary(right.id, left.id);

/**
 * Threads over the current workspace transaction, which `ThreadProjection` writes.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Threads.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  const inGroup = Effect.fnUntraced(function* (groupId: Group.Id) {
    const records = yield* rows.all((yield* read).records.of("threads"));
    return records.filter((record) => record.groupId === groupId);
  });
  const driver: ThreadStore.ThreadStore["Service"] = {
    get: Effect.fn("Threads.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("threads"), id);
      },
      Effect.mapError(storeFailure(ThreadStore, "get")),
    ),
    getMany: Effect.fn("Threads.getMany")(
      function* (ids) {
        return yield* rows.getMany((yield* read).records.of("threads"), ids);
      },
      Effect.mapError(storeFailure(ThreadStore, "getMany")),
    ),
    listByGroup: Effect.fn("Threads.listByGroup")(
      function* (groupId) {
        return (yield* inGroup(groupId)).toSorted((left, right) =>
          compareBinary(left.id, right.id),
        );
      },
      Effect.mapError(storeFailure(ThreadStore, "listByGroup")),
    ),
    listByLatest: Effect.fn("Threads.listByLatest")(
      function* (groupId, options) {
        const threads = yield* inGroup(groupId);
        const latest = new Map(
          (yield* latestRows.getMany(
            (yield* read).records.of("threadLatest"),
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
    listByStart: Effect.fn("Threads.listByStart")(
      function* (groupId, options) {
        const before = Option.fromUndefinedOr(options.before).pipe(
          Option.map((cursor) => ({
            at: DateTime.toEpochMillis(cursor.createdAt),
            id: cursor.threadId,
          })),
        );
        return (yield* inGroup(groupId))
          .map((thread) => ({
            thread,
            at: DateTime.toEpochMillis(thread.createdAt),
            id: thread.id,
          }))
          .filter((entry) => Option.isNone(before) || newestFirst(entry, before.value) > 0)
          .toSorted(newestFirst)
          .slice(0, options.limit)
          .map(({ thread }) => thread);
      },
      Effect.mapError(storeFailure(ThreadStore, "listByStart")),
    ),
    getLatest: Effect.fn("Threads.getLatest")(
      function* (ids) {
        return yield* latestRows.getMany((yield* read).records.of("threadLatest"), ids);
      },
      Effect.mapError(storeFailure(ThreadStore, "getLatest")),
    ),
    recordLatest: Effect.fn("Threads.recordLatest")(function* (latest) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(ThreadStore, "recordLatest")));
      if (!space.records.of("threads").has(latest.threadId))
        return yield* new ThreadStore.Conflict({
          operation: "recordLatest",
          message: "Thread is missing",
        });
      const current = yield* latestRows
        .get(space.records.of("threadLatest"), latest.threadId)
        .pipe(Effect.mapError(storeFailure(ThreadStore, "recordLatest")));
      // Only a later position advances; an earlier one changes nothing.
      if (Option.isSome(current) && latest.sequence <= current.value.sequence) return;
      const row = yield* latestRows
        .encode(latest)
        .pipe(Effect.mapError(storeFailure(ThreadStore, "recordLatest")));
      space.records.of("threadLatest").set(latest.threadId, row);
    }),
    rename: Effect.fn("Threads.rename")(function* (renamed) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(ThreadStore, "rename")));
      const found = yield* rows
        .get(space.records.of("threads"), renamed.threadId)
        .pipe(Effect.mapError(storeFailure(ThreadStore, "rename")));
      if (Option.isNone(found))
        return yield* new ThreadStore.Conflict({
          operation: "rename",
          message: "Thread is missing",
        });
      const row = yield* rows
        .encode({ ...found.value, title: renamed.title })
        .pipe(Effect.mapError(storeFailure(ThreadStore, "rename")));
      space.records.of("threads").set(renamed.threadId, row);
    }),
    insert: Effect.fn("Threads.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(ThreadStore, "insert")));
      if (space.records.of("threads").has(record.id))
        return yield* new ThreadStore.Conflict({
          operation: "insert",
          message: "Thread ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ThreadStore, "insert")));
      space.records.of("threads").set(record.id, row);
    }),
  };
  return ThreadStore.make(workspaceId, driver);
});
/**
 * Provide thread storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ThreadStore.ThreadStore, make());
