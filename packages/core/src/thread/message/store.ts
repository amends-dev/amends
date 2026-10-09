import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../../journal/store.ts";

import type { ThreadMessage } from "./message.ts";

export class Failure extends Schema.TaggedError<Failure>()("ThreadMessageStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

export class Conflict extends Schema.TaggedError<Conflict>()("ThreadMessageStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/** Internal projection storage. Reads honor the caller transaction; writes require it. */
export interface Interface {
  readonly get: (
    id: ThreadMessage.Id,
  ) => Effect.Effect<Option.Option<ThreadMessage.Record>, Failure>;
  /**
   * Find several messages in one read. Absent IDs are omitted and each found record appears once;
   * order is unspecified, so callers index results by ID. An empty request reads nothing.
   */
  readonly getMany: (
    ids: ReadonlyArray<ThreadMessage.Id>,
  ) => Effect.Effect<ReadonlyArray<ThreadMessage.Record>, Failure>;
  /**
   * Reject malformed or foreign records and reused IDs. The author and mentions are recorded as
   * given: publication checks that they take part. Preserve historical values on replay.
   */
  readonly insert: (
    record: ThreadMessage.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/message/store/Service",
) {}

export * as ThreadMessageStore from "./store.ts";
