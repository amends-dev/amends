import { ChannelBinding, ChannelBindingStore, ChannelId } from "@amends/core/channel";
import { Store } from "@amends/core/journal";
import { Thread } from "@amends/core/thread";
import { and, eq } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
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
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(channelBindings.workspaceId, workspaceId);
  return ChannelBindingStore.Service.of({
    get: Effect.fn("ChannelBindings.get")(
      function* (input) {
        const threadId = yield* Schema.decodeEffect(Thread.Id)(input);
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
      function* (channelInput, conversationInput) {
        const channelId = yield* Schema.decodeEffect(ChannelId.Id)(channelInput);
        const conversationId = yield* Schema.decodeEffect(Schema.NonEmptyString)(conversationInput);
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
    insert: Effect.fn("ChannelBindings.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(ChannelBindingStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new ChannelBindingStore.Conflict({
          operation: "insert",
          message: "Expected a binding in this workspace",
        });
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
  });
});

/** Provide channel binding storage over the caller's binding. @category layers */
export const layer = Layer.effect(ChannelBindingStore.Service, make());

export * as ChannelBindings from "./channel-bindings.ts";
