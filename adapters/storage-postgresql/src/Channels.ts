/**
 * The PostgreSQL driver for `ChannelStore.ChannelStore`, over the `channels` table, one row per
 * channel, removed ones included. `ChannelStore.make` checks every input before the driver sees it,
 * so the driver keeps only what storage keeps: the primary key rejects a reused ID, and an update
 * that finds no row is rejected. Every statement is scoped to the binding's workspace and runs
 * under its `guard`, which lets a read join the caller's transaction and requires one for a write.
 *
 * @since 0.1.0
 */
import { Channel, ChannelStore } from "@amends-dev/core/channel";
import { and, eq } from "drizzle-orm";
import * as Array from "effect/Array";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Binding from "./Binding.ts";
import { storeError } from "./internal/errors.ts";
import { channels } from "./internal/schema.ts";
import { StoreError } from "@amends-dev/core/journal";

const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Channel.Channel.fields, createdAt: Schema.DateTimeUtcFromDate })),
);
const toRow = (record: Channel.Channel): typeof channels.$inferInsert => ({
  workspaceId: record.workspaceId,
  id: record.id,
  connectionId: record.connectionId,
  groupId: record.groupId,
  name: record.name,
  opensTasks: record.opensTasks,
  status: record.status,
  createdBy: record.createdBy,
  createdAt: DateTime.toDate(record.createdAt),
});

/**
 * Builds the channel store for the binding's workspace: this module's driver inside
 * `ChannelStore.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Channels.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const { db } = database;
  const inWorkspace = (id: Channel.Id) =>
    and(eq(channels.workspaceId, workspaceId), eq(channels.id, id));
  const driver: ChannelStore.ChannelStore["Service"] = {
    get: Effect.fn("Channels.get")(
      function* (id) {
        return yield* guard(db.select().from(channels).where(inWorkspace(id))).pipe(
          Effect.flatMap(decodeRows),
          Effect.map(Array.head),
        );
      },
      Effect.mapError(StoreError.failed("ChannelStore", "get")),
    ),
    listActive: guard(
      db
        .select()
        .from(channels)
        .where(and(eq(channels.workspaceId, workspaceId), eq(channels.status, "active"))),
    ).pipe(
      Effect.flatMap(decodeRows),
      Effect.mapError(StoreError.failed("ChannelStore", "listActive")),
    ),
    insert: Effect.fn("Channels.insert")(function* (record) {
      yield* guard(db.insert(channels).values(toRow(record)), true).pipe(
        Effect.mapError(storeError("ChannelStore", "insert")),
      );
    }),
    update: Effect.fn("Channels.update")(function* (record) {
      const updated = yield* guard(
        db
          .update(channels)
          .set(toRow(record))
          .where(inWorkspace(record.id))
          .returning({ id: channels.id }),
        true,
      ).pipe(Effect.mapError(storeError("ChannelStore", "update")));
      if (updated.length === 0)
        return yield* StoreError.rejected("ChannelStore", "update", "Expected a stored channel");
    }),
  };
  return ChannelStore.make(workspaceId, driver);
});

/**
 * Provides `ChannelStore.ChannelStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ChannelStore.ChannelStore, make());
