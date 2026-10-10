import { Channel, ChannelStore } from "@amends/core/channel";
import { Store } from "@amends/core/journal";
import { and, eq } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { channels } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Channel.Record));
const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Channel.Record.fields, createdAt: Schema.DateTimeUtcFromDate })),
);
const toRow = (record: Channel.Record): typeof channels.$inferInsert => ({
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

/** Channel records in the workspace's database. @category constructors */
export const make = Effect.fn("Channels.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = (id: Channel.Id) =>
    and(eq(channels.workspaceId, workspaceId), eq(channels.id, id));
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
        return yield* guard(db.select().from(channels).where(inWorkspace(id))).pipe(
          Effect.flatMap(decodeRows),
          Effect.map(Array.head),
        );
      },
      Effect.mapError(storeFailure(ChannelStore, "get")),
    ),
    listActive: guard(
      db
        .select()
        .from(channels)
        .where(and(eq(channels.workspaceId, workspaceId), eq(channels.status, "active"))),
    ).pipe(Effect.flatMap(decodeRows), Effect.mapError(storeFailure(ChannelStore, "listActive"))),
    insert: Effect.fn("Channels.insert")(function* (input) {
      const record = yield* valid("insert", input);
      yield* guard(db.insert(channels).values(toRow(record)), true).pipe(
        Effect.mapError(storeError(ChannelStore, "insert")),
      );
    }),
    update: Effect.fn("Channels.update")(function* (input) {
      const record = yield* valid("update", input);
      const updated = yield* guard(
        db
          .update(channels)
          .set(toRow(record))
          .where(inWorkspace(record.id))
          .returning({ id: channels.id }),
        true,
      ).pipe(Effect.mapError(storeError(ChannelStore, "update")));
      if (updated.length === 0)
        return yield* new ChannelStore.Conflict({
          operation: "update",
          message: "Expected a stored channel",
        });
    }),
  });
});

/** Provide channel storage over the caller's binding. @category layers */
export const layer = Layer.effect(ChannelStore.Service, make());

export * as Channels from "./channels.ts";
