import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../../journal/store.ts";
import type { WorkspaceId } from "../../workspace/id.ts";
import type { ThreadActivity } from "./activity.ts";

import type { ThreadId } from "../id.ts";

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
  /** Validate schema and workspace references before insertion. Preserve historical values on replay. */
  readonly insert: (
    record: ThreadActivity.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/activity/store/Service",
) {}
export * as ThreadActivityStore from "./store.ts";
