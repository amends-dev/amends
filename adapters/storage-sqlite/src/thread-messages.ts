import { ThreadMessage, ThreadMessageStore, ThreadParticipation } from "@amends/core/thread";

import { Store } from "@amends/core/journal";
import { Array, Effect, Layer, Schema } from "effect";

import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
const validate = Schema.decodeEffect(Schema.toType(ThreadMessage.Record));
const codec = Schema.fromJsonString(ThreadMessage.Record);
const encode = Schema.encodeEffect(codec);
/** Member authors keep their workspace member as a referenced column; contacts have none. */
const authorMemberOf = (author: ThreadMessage.Author) =>
  author._tag === "Member" ? author.memberId : null;
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      workspaceId: ThreadMessage.Record.fields.workspaceId,
      id: ThreadMessage.Id,
      threadId: ThreadMessage.Record.fields.threadId,
      authorMemberId: Schema.NullOr(Schema.String),
      record: codec,
    }).check(
      Schema.makeFilter(
        (row) =>
          (row.workspaceId === row.record.workspaceId &&
            row.id === row.record.id &&
            row.threadId === row.record.threadId &&
            row.authorMemberId === authorMemberOf(row.record.author)) ||
          "Columns must match the stored record",
      ),
    ),
  ),
);
const records = (rows: ReadonlyArray<{ readonly record: ThreadMessage.Record }>) =>
  rows.map((row) => row.record);
/** Workspace-bound thread-messages projection storage. @category constructors */
export const make = Effect.fn("ThreadMessages.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  const columns = sql`workspace_id AS workspaceId, id, thread_id AS threadId, author_member_id AS authorMemberId, record`;
  return ThreadMessageStore.Service.of({
    workspaceId,
    get: Effect.fn("ThreadMessages.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(ThreadMessage.Id)(input);
        return yield* guard(
          sql`SELECT ${columns} FROM thread_messages WHERE workspace_id = ${workspaceId} AND id = ${id}`,
        ).pipe(Effect.flatMap(decode), Effect.map(records), Effect.map(Array.head));
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
      const author = record.author;
      const related = yield* guard(
        author._tag === "Member"
          ? sql`SELECT id FROM thread_participations WHERE workspace_id = ${workspaceId} AND thread_id = ${record.threadId} AND member_id = ${author.memberId}`
          : sql`SELECT id FROM thread_participations WHERE workspace_id = ${workspaceId} AND thread_id = ${record.threadId} AND participant_key = ${ThreadParticipation.keyOf({ _tag: "Contact", contactId: author.contactId })}`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadMessageStore, "insert")));
      if (related.length === 0)
        return yield* new ThreadMessageStore.Conflict({
          operation: "insert",
          message: "Missing or inconsistent references",
        });
      for (const memberId of record.mentions) {
        const found = yield* guard(
          sql`SELECT id FROM thread_participations WHERE workspace_id = ${workspaceId} AND thread_id = ${record.threadId} AND member_id = ${memberId}`,
          true,
        ).pipe(Effect.mapError(storeError(ThreadMessageStore, "insert")));
        if (found.length === 0)
          return yield* new ThreadMessageStore.Conflict({
            operation: "insert",
            message: "Mention has no participation in this thread",
          });
      }
      const data = yield* encode(record).pipe(
        Effect.mapError(storeFailure(ThreadMessageStore, "insert")),
      );
      yield* guard(
        sql`INSERT INTO thread_messages (workspace_id,id,thread_id,author_member_id,record) VALUES (${workspaceId},${record.id},${record.threadId},${authorMemberOf(author)},${data})`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadMessageStore, "insert")));
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadMessageStore.Service, make());
export * as ThreadMessages from "./thread-messages.ts";
