import { ThreadMessage, ThreadMessageStore } from "@amends/core/thread";

import { Store } from "@amends/core/journal";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { and, eq } from "drizzle-orm";
import { threadMessages, threadParticipations, members } from "./schema.ts";
import { Binding } from "./binding.ts";
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
      // A member author must be a human participant; a contact author, a contact participant.
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
              .innerJoin(
                members,
                and(
                  eq(members.workspaceId, threadParticipations.workspaceId),
                  eq(members.id, threadParticipations.memberId),
                ),
              )
              .where(
                and(
                  eq(threadParticipations.workspaceId, workspaceId),
                  eq(threadParticipations.threadId, record.threadId),
                  eq(threadParticipations.memberId, author.memberId),
                  eq(members.identityKind, "Human"),
                ),
              ),
        true,
      ).pipe(Effect.mapError(storeError(ThreadMessageStore, "insert")));
      if (related.length === 0)
        return yield* new ThreadMessageStore.Conflict({
          operation: "insert",
          message: "Missing or inconsistent references",
        });
      for (const memberId of record.mentions) {
        const found = yield* guard(
          db
            .select({ id: threadParticipations.id })
            .from(threadParticipations)
            .where(
              and(
                eq(threadParticipations.workspaceId, workspaceId),
                eq(threadParticipations.threadId, record.threadId),
                eq(threadParticipations.memberId, memberId),
              ),
            ),
          true,
        ).pipe(Effect.mapError(storeError(ThreadMessageStore, "insert")));
        if (found.length === 0)
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
