import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";
import type { WorkspaceId } from "../workspace/id.ts";
import type { Thread } from "./thread.ts";
import type { GroupId } from "../group/id.ts";

export class Failure extends Schema.TaggedError<Failure>()("ThreadStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("ThreadStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}
/** Internal projection storage. Reads honor the caller transaction; writes require it. */
export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  readonly get: (id: Thread.Id) => Effect.Effect<Option.Option<Thread.Record>, Failure>;
  readonly listByGroup: (id: GroupId.Id) => Effect.Effect<ReadonlyArray<Thread.Record>, Failure>;
  /**
   * A group's threads with recorded activity, newest latest activity first, then ID in descending
   * binary order, after the exclusive `before` cursor and up to `limit`.
   */
  readonly listByLatest: (
    id: GroupId.Id,
    options: Thread.ListOptions,
  ) => Effect.Effect<ReadonlyArray<Thread.Record>, Failure>;
  /** Validate schema and workspace references before insertion. Preserve historical values on replay. */
  readonly insert: (
    record: Thread.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /**
   * Latest content activity of several threads in one read. Threads without any, and absent IDs,
   * are omitted; order is unspecified.
   */
  readonly getLatest: (
    ids: ReadonlyArray<Thread.Id>,
  ) => Effect.Effect<ReadonlyArray<Thread.Latest>, Failure>;
  /**
   * Projection write that advances a thread's latest content activity. A position at or before the
   * recorded one changes nothing; a missing, foreign, or malformed thread conflicts.
   */
  readonly recordLatest: (
    latest: Thread.Latest,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/store/Service",
) {}
export * as ThreadStore from "./store.ts";
