import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../../journal/store.ts";
import type { WorkspaceId } from "../../workspace/id.ts";
import type { ThreadActivity } from "./activity.ts";

import type { ThreadId } from "../id.ts";

/**
 * One page of a thread's timeline, always in ascending sequence order. The range lies strictly
 * after `afterSequence` (zero or omitted: from the first activity) and strictly before
 * `beforeSequence` (omitted: through the latest). The page holds the range's oldest `limit`
 * activities, or with `from: "newest"` its newest, so a view can open at the latest activity and
 * page back by passing its first item's sequence as `beforeSequence`.
 */
export const ReadOptions = Schema.Struct({
  afterSequence: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  beforeSequence: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  from: Schema.optionalKey(Schema.Literals(["oldest", "newest"])),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
}).check(
  Schema.makeFilter(
    ({ afterSequence, beforeSequence }) =>
      afterSequence === undefined ||
      beforeSequence === undefined ||
      beforeSequence > afterSequence ||
      "beforeSequence must come after afterSequence",
  ),
);
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
  /**
   * At most limit activities of the requested range, from its requested end, in ascending
   * sequence order. No shared snapshot across pages.
   */
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
