import { Thread, ThreadMessage, ThreadMessageStore } from "@amends/core/thread";

import { Store } from "@amends/core/journal";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { and, count, eq } from "drizzle-orm";
import { threadMessages } from "./schema.ts";
import { Binding } from "./binding.ts";
import { inIds } from "./id-list.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
const validate = Schema.decodeEffect(Schema.toType(ThreadMessage.Record));
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...ThreadMessage.Record.fields,
      publishedAt: Schema.DateTimeUtcFromDate,
      content: Schema.TaggedUnion({
        Text: {
          ...ThreadMessage.Content.cases.Text.fields,
          editedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
        },
        Deleted: { deletedAt: Schema.DateTimeUtcFromDate },
      }),
    }),
  ),
);
const decodeCounts = Schema.decodeUnknownEffect(Schema.Array(ThreadMessageStore.Count));
type Row = typeof threadMessages.$inferSelect;
type Insert = typeof threadMessages.$inferInsert;
/**
 * Each author, via, and content kind reads only its own columns; the table constraints reject
 * mixed rows.
 */
const toRecord = ({
  authorKind,
  authorMemberId,
  authorContactId,
  viaKind,
  turnId,
  channelId,
  externalMessageId,
  contentKind,
  text,
  mentions,
  revision,
  editedAt,
  deletedAt,
  ...row
}: Row) => ({
  ...row,
  author:
    authorKind === "Member"
      ? { _tag: authorKind, memberId: authorMemberId }
      : { _tag: authorKind, contactId: authorContactId },
  via:
    viaKind === null
      ? null
      : viaKind === "Turn"
        ? { _tag: viaKind, turnId }
        : { _tag: viaKind, channelId, externalMessageId },
  content:
    contentKind === "Text"
      ? { _tag: contentKind, text, mentions, revision, editedAt }
      : { _tag: contentKind, deletedAt },
});
const authorColumns = (
  author: ThreadMessage.Author,
): Pick<Insert, "authorKind" | "authorMemberId" | "authorContactId"> =>
  ThreadMessage.Author.isAnyOf(["Member"])(author)
    ? { authorKind: "Member", authorMemberId: author.memberId, authorContactId: null }
    : { authorKind: "Contact", authorMemberId: null, authorContactId: author.contactId };
const viaColumns = (
  via: ThreadMessage.Via | null,
): Pick<Insert, "viaKind" | "turnId" | "channelId" | "externalMessageId"> =>
  via === null
    ? { viaKind: null, turnId: null, channelId: null, externalMessageId: null }
    : ThreadMessage.Via.isAnyOf(["Turn"])(via)
      ? { viaKind: "Turn", turnId: via.turnId, channelId: null, externalMessageId: null }
      : {
          viaKind: "Channel",
          turnId: null,
          channelId: via.channelId,
          externalMessageId: via.externalMessageId,
        };
const contentColumns = (
  content: ThreadMessage.Content,
): Pick<Insert, "contentKind" | "text" | "mentions" | "revision" | "editedAt" | "deletedAt"> =>
  ThreadMessage.Content.isAnyOf(["Text"])(content)
    ? {
        contentKind: "Text",
        text: content.text,
        mentions: [...content.mentions],
        revision: content.revision,
        editedAt: content.editedAt === null ? null : DateTime.toDate(content.editedAt),
        deletedAt: null,
      }
    : {
        contentKind: "Deleted",
        text: null,
        mentions: null,
        revision: null,
        editedAt: null,
        deletedAt: DateTime.toDate(content.deletedAt),
      };
const decodeRows = (rows: ReadonlyArray<Row>) =>
  decode(rows.map(toRecord)).pipe(
    Effect.flatMap((values) => Effect.forEach(values, (record) => validate(record))),
  );
/** Workspace-bound thread-messages projection storage. @category constructors */
export const make = Effect.fn("ThreadMessages.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(threadMessages.workspaceId, workspaceId);
  /** Replace a message's content, which must have text; nothing updated means no such message. */
  const replaceContent = Effect.fnUntraced(function* (
    operation: string,
    messageId: ThreadMessage.Id,
    content: ThreadMessage.Content,
    expectedRevision: number | undefined,
  ) {
    const updated = yield* guard(
      db
        .update(threadMessages)
        .set(contentColumns(content))
        .where(
          and(
            inWorkspace,
            eq(threadMessages.id, messageId),
            eq(threadMessages.contentKind, "Text"),
            expectedRevision === undefined
              ? undefined
              : eq(threadMessages.revision, expectedRevision),
          ),
        )
        .returning({ id: threadMessages.id }),
      true,
    ).pipe(Effect.mapError(storeError(ThreadMessageStore, operation)));
    if (updated.length === 0)
      return yield* new ThreadMessageStore.Conflict({
        operation,
        message:
          expectedRevision === undefined
            ? "Expected a message with text"
            : "Expected a message with text at the revision before",
      });
  });
  return ThreadMessageStore.Service.of({
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
    countByThread: Effect.fn("ThreadMessages.countByThread")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(Thread.Id))(input);
        if (ids.length === 0) return [];
        return yield* guard(
          db
            .select({ threadId: threadMessages.threadId, count: count() })
            .from(threadMessages)
            .where(
              and(
                inWorkspace,
                inIds(threadMessages.threadId, ids),
                eq(threadMessages.contentKind, "Text"),
              ),
            )
            .groupBy(threadMessages.threadId),
        ).pipe(Effect.flatMap(decodeCounts));
      },
      Effect.mapError(storeFailure(ThreadMessageStore, "countByThread")),
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
      yield* guard(
        db.insert(threadMessages).values({
          workspaceId: record.workspaceId,
          id: record.id,
          threadId: record.threadId,
          ...authorColumns(record.author),
          ...viaColumns(record.via),
          publishedAt: DateTime.toDate(record.publishedAt),
          ...contentColumns(record.content),
        }),
        true,
      ).pipe(Effect.mapError(storeError(ThreadMessageStore, "insert")));
    }),
    edit: Effect.fn("ThreadMessages.edit")(function* (input) {
      yield* Store.Transaction;
      const edited = yield* Schema.decodeEffect(Schema.toType(ThreadMessage.Edited))(input).pipe(
        Effect.mapError(storeConflict(ThreadMessageStore, "edit")),
      );
      if (edited.workspaceId !== workspaceId)
        return yield* new ThreadMessageStore.Conflict({
          operation: "edit",
          message: "Expected a message in this workspace",
        });
      yield* replaceContent(
        "edit",
        edited.messageId,
        {
          _tag: "Text",
          text: edited.text,
          mentions: edited.mentions,
          revision: edited.revision,
          editedAt: edited.editedAt,
        },
        edited.revision - 1,
      );
    }),
    delete: Effect.fn("ThreadMessages.delete")(function* (input) {
      yield* Store.Transaction;
      const deleted = yield* Schema.decodeEffect(Schema.toType(ThreadMessage.Deleted))(input).pipe(
        Effect.mapError(storeConflict(ThreadMessageStore, "delete")),
      );
      if (deleted.workspaceId !== workspaceId)
        return yield* new ThreadMessageStore.Conflict({
          operation: "delete",
          message: "Expected a message in this workspace",
        });
      yield* replaceContent(
        "delete",
        deleted.messageId,
        { _tag: "Deleted", deletedAt: deleted.deletedAt },
        undefined,
      );
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadMessageStore.Service, make());
export * as ThreadMessages from "./thread-messages.ts";
