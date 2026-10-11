import { ChannelBinding, ChannelBindingStore } from "@amends-dev/core/channel";
import { and, eq } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import * as Binding from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
import { channelBindings } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(ChannelBinding.Record));
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({ ...ChannelBinding.Record.fields, boundAt: Schema.DateTimeUtcFromDate }),
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

/** Channel bindings in the workspace's database, keyed by thread. @category constructors */
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

/** Provide channel binding storage over the caller's binding. @category layers */
export const layer = Layer.effect(ChannelBindingStore.ChannelBindingStore, make());
