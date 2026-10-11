/**
 * The storage contract for channels, which every storage adapter implements and `ChannelProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type * as Store from "../journal/store.ts";
import * as Channel from "./Channel.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/id.ts";

/**
 * Storage failed while reading or writing channels.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("ChannelStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused id, or a change
 * to a channel that is missing.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("ChannelStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The channel store, bound to one workspace by the host.
 *
 * What a storage adapter implements for channels.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class ChannelStore extends Context.Service<
  ChannelStore,
  {
    /** The channel, removed or not. */
    readonly get: (id: Channel.Id) => Effect.Effect<Option.Option<Channel.Record>, Failure>;
    /** The workspace's channels that are not removed, in no particular order. */
    readonly listActive: Effect.Effect<ReadonlyArray<Channel.Record>, Failure>;
    /** Reject a reused id. Never upsert. */
    readonly insert: (
      record: Channel.Record,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /** Replace a stored channel; a missing record conflicts. */
    readonly update: (
      record: Channel.Record,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/channel/ChannelStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: ChannelStore["Service"],
): ChannelStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Channel.Id, id), driver.get),
    listActive: driver.listActive,
    insert: (record) => Effect.flatMap(write("insert", Channel.Record, record), driver.insert),
    update: (record) => Effect.flatMap(write("update", Channel.Record, record), driver.update),
  };
};
