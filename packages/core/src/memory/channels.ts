import { Channel, ChannelStore } from "../channel/index.ts";
import { Store } from "../journal/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Channel.Record));
const rows = Rows.make(Schema.fromJsonString(Channel.Record));

/** Channel records over the current workspace transaction. @category constructors */
export const make = Effect.fn("Channels.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  /** Validate a record for this workspace before writing it. */
  const valid = (operation: string, input: Channel.Record) =>
    Effect.gen(function* () {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(ChannelStore, operation)),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new ChannelStore.Conflict({
          operation,
          message: "Expected a channel in this workspace",
        });
      return record;
    });
  return ChannelStore.Service.of({
    get: Effect.fn("Channels.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Channel.Id)(input);
        return yield* rows.get((yield* read).records.of("channels"), id);
      },
      Effect.mapError(storeFailure(ChannelStore, "get")),
    ),
    listActive: Effect.gen(function* () {
      const records = yield* rows.all((yield* read).records.of("channels"));
      return records.filter((record) => record.status === "active");
    }).pipe(Effect.mapError(storeFailure(ChannelStore, "listActive"))),
    insert: Effect.fn("Channels.insert")(function* (input) {
      const record = yield* valid("insert", input);
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
    update: Effect.fn("Channels.update")(function* (input) {
      const record = yield* valid("update", input);
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
  });
});

/** Provide channel storage over the caller's binding. @category layers */
export const layer = Layer.effect(ChannelStore.Service, make());

export * as Channels from "./channels.ts";
