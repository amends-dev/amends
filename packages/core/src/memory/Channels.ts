/**
 * The memory implementation of `ChannelStore` from `../channel/ChannelStore.ts`, over the
 * workspace's `Binding`. It keeps what the contract leaves to storage: a reused ID conflicts, and
 * so does an update of a missing channel. `ChannelStore.make` checks every input before this
 * driver sees it.
 *
 * @since 0.1.0
 */
import { Channel, ChannelStore } from "../channel/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";

const rows = Rows.make(Schema.fromJsonString(Channel.Channel));

/**
 * Channel records over the current workspace transaction.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Channels.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  const driver: ChannelStore.ChannelStore["Service"] = {
    get: Effect.fn("Channels.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("channels"), id);
      },
      Effect.mapError(storeFailure(ChannelStore, "get")),
    ),
    listActive: Effect.gen(function* () {
      const records = yield* rows.all((yield* read).records.of("channels"));
      return records.filter((record) => record.status === "active");
    }).pipe(Effect.mapError(storeFailure(ChannelStore, "listActive"))),
    insert: Effect.fn("Channels.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(ChannelStore, "insert")));
      if (space.records.of("channels").has(record.id))
        return yield* new ChannelStore.Conflict({
          operation: "insert",
          message: "Channel ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ChannelStore, "insert")));
      space.records.of("channels").set(record.id, row);
    }),
    update: Effect.fn("Channels.update")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(ChannelStore, "update")));
      const found = yield* rows
        .get(space.records.of("channels"), record.id)
        .pipe(Effect.mapError(storeFailure(ChannelStore, "update")));
      if (Option.isNone(found))
        return yield* new ChannelStore.Conflict({
          operation: "update",
          message: "Expected a stored channel",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ChannelStore, "update")));
      space.records.of("channels").set(record.id, row);
    }),
  };
  return ChannelStore.make(workspaceId, driver);
});

/**
 * Provide channel storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ChannelStore.ChannelStore, make());
