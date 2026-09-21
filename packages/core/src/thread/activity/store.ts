import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../../journal/store.ts";
import type { WorkspaceId } from "../../workspace/id.ts";
import type { ThreadActivity } from "./activity.ts";

import type { ThreadId } from "../id.ts";

/** Exclusive sequence boundary within one thread. Zero or omission starts before its first activity. */
export const ReadOptions = Schema.Struct({
  afterSequence: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface ReadOptions extends Schema.Schema.Type<typeof ReadOptions> {}

export class Failure extends Schema.TaggedError<Failure>()("ThreadActivityStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("ThreadActivityStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}
/** Internal projection storage. Reads honor the caller transaction; writes require it. */
export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  readonly get: (
    id: ThreadActivity.Id,
  ) => Effect.Effect<Option.Option<ThreadActivity.Record>, Failure>;
  readonly listByThread: (
    id: ThreadId.Id,
  ) => Effect.Effect<ReadonlyArray<ThreadActivity.Record>, Failure>;
  /** Latest activity in this thread, using the caller's transaction when present. */
  readonly latest: (
    id: ThreadId.Id,
  ) => Effect.Effect<Option.Option<ThreadActivity.Record>, Failure>;
  /** At most limit activities, strictly after the cursor, in ascending sequence order. No shared snapshot across pages. */
  readonly readPage: (
    id: ThreadId.Id,
    options: ReadOptions,
  ) => Effect.Effect<ReadonlyArray<ThreadActivity.Record>, Failure>;
  /** Validate schema and workspace references before insertion. Preserve historical values on replay. */
  readonly insert: (
    record: ThreadActivity.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/activity/store/Service",
) {}
export * as ThreadActivityStore from "./store.ts";
