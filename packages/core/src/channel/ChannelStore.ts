/**
 * The storage contract for channels, which every storage adapter implements and `ChannelProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Store from "../journal/Store.ts";
import * as Channel from "./Channel.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";
import * as StoreError from "../journal/StoreError.ts";

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
    readonly get: (
      id: Channel.Id,
    ) => Effect.Effect<Option.Option<Channel.Channel>, StoreError.StoreError>;
    /** The workspace's channels that are not removed, in no particular order. */
    readonly listActive: Effect.Effect<ReadonlyArray<Channel.Channel>, StoreError.StoreError>;
    /** Reject a reused id. Never upsert. */
    readonly insert: (
      record: Channel.Channel,
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>;
    /** Replace a stored channel; a missing record is rejected. */
    readonly update: (
      record: Channel.Channel,
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>;
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
  const read = StoreInput.read("ChannelStore");
  const write = StoreInput.write("ChannelStore", workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Channel.Id, id), driver.get),
    listActive: driver.listActive,
    insert: (record) => Effect.flatMap(write("insert", Channel.Channel, record), driver.insert),
    update: (record) => Effect.flatMap(write("update", Channel.Channel, record), driver.update),
  };
};

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Channel.Channel));

/**
 * Channel records over the current workspace transaction.
 */
const makeMemory = Effect.fn("ChannelStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding;
  const driver: ChannelStore["Service"] = {
    get: Effect.fn("ChannelStore.memory.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("channels"), id);
      },
      Effect.mapError(StoreError.failed("ChannelStore", "get")),
    ),
    listActive: Effect.gen(function* () {
      const records = yield* rows.all((yield* read).records.of("channels"));
      return records.filter((record) => record.status === "active");
    }).pipe(Effect.mapError(StoreError.failed("ChannelStore", "listActive"))),
    insert: Effect.fn("ChannelStore.memory.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(StoreError.failed("ChannelStore", "insert")));
      if (space.records.of("channels").has(record.id))
        return yield* StoreError.rejected("ChannelStore", "insert", "Channel ID already exists");
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(StoreError.failed("ChannelStore", "insert")));
      space.records.of("channels").set(record.id, row);
    }),
    update: Effect.fn("ChannelStore.memory.update")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(StoreError.failed("ChannelStore", "update")));
      const found = yield* rows
        .get(space.records.of("channels"), record.id)
        .pipe(Effect.mapError(StoreError.failed("ChannelStore", "update")));
      if (Option.isNone(found))
        return yield* StoreError.rejected("ChannelStore", "update", "Expected a stored channel");
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(StoreError.failed("ChannelStore", "update")));
      space.records.of("channels").set(record.id, row);
    }),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `ChannelStore` in process memory, over the workspace's `Store.MemoryBinding`. It keeps
 * what the contract leaves to storage: a reused ID is rejected, and so is an update of a missing
 * channel. `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(ChannelStore, makeMemory());
