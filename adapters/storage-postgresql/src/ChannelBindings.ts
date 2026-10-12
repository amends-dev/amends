/**
 * The PostgreSQL driver for `ChannelBindingStore.ChannelBindingStore`, over the `channel_bindings`
 * table: one row per bound thread, keyed by the thread, with the conversation's ID in a column and
 * its details, which the transport defines, as JSON. `ChannelBindingStore.make` checks every input
 * before the driver sees it, so the driver keeps only what storage keeps: the primary key refuses a
 * thread bound already and `channel_bindings_by_conversation` a conversation bound to another
 * thread of the channel, each as the store's `Conflict`. Every statement is scoped to the
 * binding's workspace and runs under its `guard`, which lets a read join the caller's transaction
 * and requires one for a write.
 *
 * @since 0.1.0
 */
import { ChannelBinding, ChannelBindingStore } from "@amends-dev/core/channel";
import { and, eq } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeError, storeFailure } from "./internal/errors.ts";
import { channelBindings } from "./internal/schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(ChannelBinding.ChannelBinding));
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({ ...ChannelBinding.ChannelBinding.fields, boundAt: Schema.DateTimeUtcFromDate }),
  ),
);
type Row = typeof channelBindings.$inferSelect;
/** The conversation's id and details read back as the one value the transport gave. */
const toRecord = ({ conversationId, conversationDetails, ...row }: Row) => ({
  ...row,
  conversation: { id: conversationId, details: conversationDetails },
});
const decodeRows = (rows: ReadonlyArray<Row>) =>
  decode(rows.map(toRecord)).pipe(
    Effect.flatMap((values) => Effect.forEach(values, (record) => validateRecord(record))),
  );

/**
 * Builds the channel binding store for the binding's workspace: this module's driver inside
 * `ChannelBindingStore.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ChannelBindings.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const { db } = database;
  const inWorkspace = eq(channelBindings.workspaceId, workspaceId);
  const driver: ChannelBindingStore.ChannelBindingStore["Service"] = {
    get: Effect.fn("ChannelBindings.get")(
      function* (threadId) {
        return yield* guard(
          db
            .select()
            .from(channelBindings)
            .where(and(inWorkspace, eq(channelBindings.threadId, threadId))),
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(ChannelBindingStore, "get")),
    ),
    findByConversation: Effect.fn("ChannelBindings.findByConversation")(
      function* (channelId, conversationId) {
        return yield* guard(
          db
            .select()
            .from(channelBindings)
            .where(
              and(
                inWorkspace,
                eq(channelBindings.channelId, channelId),
                eq(channelBindings.conversationId, conversationId),
              ),
            ),
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(ChannelBindingStore, "findByConversation")),
    ),
    insert: Effect.fn("ChannelBindings.insert")(function* (record) {
      yield* guard(
        db.insert(channelBindings).values({
          workspaceId: record.workspaceId,
          threadId: record.threadId,
          channelId: record.channelId,
          groupId: record.groupId,
          conversationId: record.conversation.id,
          conversationDetails: record.conversation.details,
          boundAt: DateTime.toDate(record.boundAt),
        }),
        true,
      ).pipe(Effect.mapError(storeError(ChannelBindingStore, "insert")));
    }),
  };
  return ChannelBindingStore.make(workspaceId, driver);
});

/**
 * Provides `ChannelBindingStore.ChannelBindingStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ChannelBindingStore.ChannelBindingStore, make());
