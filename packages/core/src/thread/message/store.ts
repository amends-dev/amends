import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../../journal/store.ts";
import type { WorkspaceId } from "../../workspace/id.ts";
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
  readonly workspaceId: WorkspaceId.Id;
  readonly get: (
    id: ThreadMessage.Id,
  ) => Effect.Effect<Option.Option<ThreadMessage.Record>, Failure>;
  /** Validate schema and workspace references before insertion. Preserve historical values on replay. */
  readonly insert: (
    record: ThreadMessage.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/message/store/Service",
) {}
export * as ThreadMessageStore from "./store.ts";
