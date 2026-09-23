import { ThreadMessage, ThreadMessageStore } from "@amends/core/thread";

import { Store } from "@amends/core/journal";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { and, countDistinct, eq } from "drizzle-orm";
import { threadMessages, threadParticipations } from "./schema.ts";
import { Binding } from "./binding.ts";
import { inIds } from "./id-list.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
const validate = Schema.decodeEffect(Schema.toType(ThreadMessage.Record));
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({ ...ThreadMessage.Record.fields, publishedAt: Schema.DateTimeUtcFromDate }),
  ),
);
type Row = typeof threadMessages.$inferSelect;
/** Each author kind reads only its own column; the table constraint rejects mixed rows. */
const toRecord = ({ authorKind, authorMemberId, authorContactId, ...row }: Row) => ({
  ...row,
  author:
    authorKind === "Member"
      ? { _tag: authorKind, memberId: authorMemberId }
      : { _tag: authorKind, contactId: authorContactId },
});
const authorColumns = (
  author: ThreadMessage.Author,
): Pick<typeof threadMessages.$inferInsert, "authorKind" | "authorMemberId" | "authorContactId"> =>
  author._tag === "Member"
    ? { authorKind: "Member", authorMemberId: author.memberId, authorContactId: null }
    : { authorKind: "Contact", authorMemberId: null, authorContactId: author.contactId };
const decodeRows = (rows: ReadonlyArray<Row>) =>
  decode(rows.map(toRecord)).pipe(
    Effect.flatMap((values) => Effect.forEach(values, (record) => validate(record))),
  );
/** Workspace-bound thread-messages projection storage. @category constructors */
export const make = Effect.fn("ThreadMessages.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(threadMessages.workspaceId, workspaceId);
  return ThreadMessageStore.Service.of({
    workspaceId,
    get: Effect.fn("ThreadMessages.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(ThreadMessage.Id)(input);
        return yield* guard(
          db
            .select()
            .from(threadMessages)
            .where(and(inWorkspace, eq(threadMessages.id, id))),
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(ThreadMessageStore, "get")),
    ),
    getMany: Effect.fn("ThreadMessages.getMany")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(ThreadMessage.Id))(input);
        if (ids.length === 0) return [];
        return yield* guard(
          db
            .select()
            .from(threadMessages)
            .where(and(inWorkspace, inIds(threadMessages.id, ids))),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(storeFailure(ThreadMessageStore, "getMany")),
    ),
    insert: Effect.fn("ThreadMessages.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validate(input).pipe(
        Effect.mapError(storeConflict(ThreadMessageStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new ThreadMessageStore.Conflict({
          operation: "insert",
          message: "Invalid initial record or workspace",
        });
      // An author must participate in the thread; which authors may publish is a workflow rule.
      const author = record.author;
      const related = yield* guard(
        author._tag === "Contact"
          ? db
              .select({ id: threadParticipations.id })
              .from(threadParticipations)
              .where(
                and(
                  eq(threadParticipations.workspaceId, workspaceId),
                  eq(threadParticipations.threadId, record.threadId),
                  eq(threadParticipations.participantKind, "Contact"),
                  eq(threadParticipations.identityId, author.contactId),
                ),
              )
          : db
              .select({ id: threadParticipations.id })
              .from(threadParticipations)
              .where(
                and(
                  eq(threadParticipations.workspaceId, workspaceId),
                  eq(threadParticipations.threadId, record.threadId),
                  eq(threadParticipations.memberId, author.memberId),
                ),
              ),
        true,
      ).pipe(Effect.mapError(storeError(ThreadMessageStore, "insert")));
      if (related.length === 0)
        return yield* new ThreadMessageStore.Conflict({
          operation: "insert",
          message: "Missing or inconsistent references",
        });
      // Mentions are distinct, so each must match a member with a participation in this thread.
      if (record.mentions.length > 0) {
        const [mentioned] = yield* guard(
          db
            .select({ count: countDistinct(threadParticipations.memberId) })
            .from(threadParticipations)
            .where(
              and(
                eq(threadParticipations.workspaceId, workspaceId),
                eq(threadParticipations.threadId, record.threadId),
                inIds(threadParticipations.memberId, record.mentions),
              ),
            ),
          true,
        ).pipe(Effect.mapError(storeError(ThreadMessageStore, "insert")));
        if (mentioned?.count !== record.mentions.length)
          return yield* new ThreadMessageStore.Conflict({
            operation: "insert",
            message: "Mention has no participation in this thread",
          });
      }
      const { author: _, ...fields } = record;
      yield* guard(
        db.insert(threadMessages).values({
          ...fields,
          ...authorColumns(author),
          publishedAt: DateTime.toDate(record.publishedAt),
          mentions: [...record.mentions],
        }),
        true,
      ).pipe(Effect.mapError(storeError(ThreadMessageStore, "insert")));
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadMessageStore.Service, make());
export * as ThreadMessages from "./thread-messages.ts";
