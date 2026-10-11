/**
 * The storage contract for session logs, which every storage adapter implements and a turn's job
 * writes: one append-only log for each participation in the workspace, whose entries
 * `SessionLog.Entry` describes. Logs take part in no commit, so a host may keep them apart from
 * its other stores, in one built for appending, and nothing here needs a transaction. A log's
 * first entry is at position 1, and each next one follows it.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import type { Array } from "effect";
import * as ThreadParticipationId from "../thread/ThreadParticipationId.ts";
import * as SessionLog from "./SessionLog.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";

/**
 * Storage failed while reading or writing session logs.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("SessionLogStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * The log holds an entry past where its writer read it to: someone else wrote there meanwhile.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("SessionLogStore.Conflict", {
  participationId: Schema.String,
  after: Schema.Int,
}) {}

/**
 * A page of a log: its entries past `after`, at most `limit` of them.
 *
 * @category options
 * @since 0.1.0
 */
export const ReadOptions = Schema.Struct({
  after: Schema.Natural,
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});

/**
 * @category options
 * @since 0.1.0
 */
export interface ReadOptions extends Schema.Schema.Type<typeof ReadOptions> {}

/**
 * The session log store, bound to one workspace by the host: what a storage adapter implements
 * for session logs.
 *
 * `make` builds the store over a driver of the same shape. It checks every input against its
 * schema before the driver sees it, so a driver keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class SessionLogStore extends Context.Service<
  SessionLogStore,
  {
    /** The position of the log's latest entry, or 0 while it has none. */
    readonly head: (participationId: ThreadParticipationId.Id) => Effect.Effect<number, Failure>;
    /**
     * Append `entries` in order after the entry at `after`, the log's latest as the writer read it,
     * or 0 for an empty log. A log that holds an entry past `after` takes none of them and fails with
     * Conflict, so a writer that fell behind, as one another replaced has, cannot write past it.
     */
    readonly append: (
      participationId: ThreadParticipationId.Id,
      entries: Array.NonEmptyReadonlyArray<SessionLog.Entry>,
      after: number,
    ) => Effect.Effect<Array.NonEmptyReadonlyArray<SessionLog.Recorded>, Failure | Conflict>;
    /** The log's entries past `after`, oldest first, at most `limit` of them. */
    readonly read: (
      participationId: ThreadParticipationId.Id,
      options: ReadOptions,
    ) => Effect.Effect<ReadonlyArray<SessionLog.Recorded>, Failure>;
    /** Completes once the log holds an entry past `after`. */
    readonly waitForAppend: (
      participationId: ThreadParticipationId.Id,
      after: number,
    ) => Effect.Effect<void, Failure>;
  }
>()("@amends-dev/core/turn/session-log-store/Service") {}

/**
 * The store over a driver: each input is checked against its schema before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: SessionLogStore["Service"],
): SessionLogStore["Service"] => {
  const read = StoreInput.read(Failure);
  return {
    head: (participationId) =>
      Effect.flatMap(read("head", ThreadParticipationId.Id, participationId), driver.head),
    append: Effect.fn("SessionLogStore.append")(function* (participationId, entries, after) {
      return yield* driver.append(
        yield* read("append", ThreadParticipationId.Id, participationId),
        yield* read("append", Schema.NonEmptyArray(SessionLog.Entry), entries),
        yield* read("append", Schema.Natural, after),
      );
    }),
    read: Effect.fn("SessionLogStore.read")(function* (participationId, options) {
      return yield* driver.read(
        yield* read("read", ThreadParticipationId.Id, participationId),
        yield* read("read", ReadOptions, options),
      );
    }),
    waitForAppend: Effect.fn("SessionLogStore.waitForAppend")(function* (participationId, after) {
      return yield* driver.waitForAppend(
        yield* read("waitForAppend", ThreadParticipationId.Id, participationId),
        yield* read("waitForAppend", Schema.Natural, after),
      );
    }),
  };
};
