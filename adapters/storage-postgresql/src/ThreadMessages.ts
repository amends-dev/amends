/**
 * The PostgreSQL driver for `ThreadMessageStore.ThreadMessageStore`, over the `thread_messages`
 * table: a message's author, how it came about, and its content each as a kind column beside that
 * kind's own columns, which the table's checks keep from mixing. `ThreadMessageStore.make` checks
 * every input before the driver sees it, so the driver keeps only what storage keeps: the primary
 * key rejects a reused ID, and an edit or deletion is a conditional update rejected unless the
 * message still has text, at the revision before for an edit. Every statement is scoped to the
 * binding's workspace and runs under its `guard`, which lets a read join the caller's transaction
 * and requires one for a write.
 *
 * @since 0.1.0
 */

import { StoreError } from "@amends-dev/core/journal"
import { ThreadMessage, ThreadMessageStore } from "@amends-dev/core/thread"
import { and, count, eq } from "drizzle-orm"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Binding from "./Binding.ts"
import { storeError } from "./internal/errors.ts"
import { inIds } from "./internal/id-list.ts"
import { threadMessages } from "./internal/schema.ts"
const validate = Schema.decodeEffect(Schema.toType(ThreadMessage.ThreadMessage))
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...ThreadMessage.ThreadMessage.fields,
      publishedAt: Schema.DateTimeUtcFromDate,
      content: Schema.TaggedUnion({
        Text: {
          ...ThreadMessage.Content.cases.Text.fields,
          editedAt: Schema.NullOr(Schema.DateTimeUtcFromDate)
        },
        Deleted: { deletedAt: Schema.DateTimeUtcFromDate }
      })
    })
  )
)
const decodeCounts = Schema.decodeUnknownEffect(Schema.Array(ThreadMessageStore.Count))
type Row = typeof threadMessages.$inferSelect
type Insert = typeof threadMessages.$inferInsert
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
      : { _tag: contentKind, deletedAt }
})
const authorColumns = (
  author: ThreadMessage.Author
): Pick<Insert, "authorKind" | "authorMemberId" | "authorContactId"> =>
  ThreadMessage.Author.isAnyOf(["Member"])(author)
    ? { authorKind: "Member", authorMemberId: author.memberId, authorContactId: null }
    : { authorKind: "Contact", authorMemberId: null, authorContactId: author.contactId }
const viaColumns = (
  via: ThreadMessage.Via | null
): Pick<Insert, "viaKind" | "turnId" | "channelId" | "externalMessageId"> =>
  via === null
    ? { viaKind: null, turnId: null, channelId: null, externalMessageId: null }
    : ThreadMessage.Via.isAnyOf(["Turn"])(via)
      ? { viaKind: "Turn", turnId: via.turnId, channelId: null, externalMessageId: null }
      : {
          viaKind: "Channel",
          turnId: null,
          channelId: via.channelId,
          externalMessageId: via.externalMessageId
        }
const contentColumns = (
  content: ThreadMessage.Content
): Pick<Insert, "contentKind" | "text" | "mentions" | "revision" | "editedAt" | "deletedAt"> =>
  ThreadMessage.Content.isAnyOf(["Text"])(content)
    ? {
        contentKind: "Text",
        text: content.text,
        mentions: [...content.mentions],
        revision: content.revision,
        editedAt: content.editedAt === null ? null : DateTime.toDate(content.editedAt),
        deletedAt: null
      }
    : {
        contentKind: "Deleted",
        text: null,
        mentions: null,
        revision: null,
        editedAt: null,
        deletedAt: DateTime.toDate(content.deletedAt)
      }
const decodeRows = (rows: ReadonlyArray<Row>) =>
  decode(rows.map(toRecord)).pipe(Effect.flatMap((values) => Effect.forEach(values, (record) => validate(record))))
/**
 * Builds the message store for the binding's workspace: this module's driver inside
 * `ThreadMessageStore.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ThreadMessages.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding
  const { db } = database
  const inWorkspace = eq(threadMessages.workspaceId, workspaceId)
  /** Replace a message's content, which must have text; nothing updated means no such message. */
  const replaceContent = Effect.fnUntraced(function* (
    operation: string,
    messageId: ThreadMessage.Id,
    content: ThreadMessage.Content,
    expectedRevision: number | undefined
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
            expectedRevision === undefined ? undefined : eq(threadMessages.revision, expectedRevision)
          )
        )
        .returning({ id: threadMessages.id }),
      true
    ).pipe(Effect.mapError(storeError("ThreadMessageStore", operation)))
    if (updated.length === 0)
      return yield* StoreError.rejected(
        "ThreadMessageStore",
        operation,
        expectedRevision === undefined
          ? "Expected a message with text"
          : "Expected a message with text at the revision before"
      )
  })
  const driver: ThreadMessageStore.ThreadMessageStore["Service"] = {
    get: Effect.fn("ThreadMessages.get")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(threadMessages)
            .where(and(inWorkspace, eq(threadMessages.id, id)))
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head))
      },
      Effect.mapError(StoreError.failed("ThreadMessageStore", "get"))
    ),
    getMany: Effect.fn("ThreadMessages.getMany")(
      function* (ids) {
        if (ids.length === 0) return []
        return yield* guard(
          db
            .select()
            .from(threadMessages)
            .where(and(inWorkspace, inIds(threadMessages.id, ids)))
        ).pipe(Effect.flatMap(decodeRows))
      },
      Effect.mapError(StoreError.failed("ThreadMessageStore", "getMany"))
    ),
    countByThread: Effect.fn("ThreadMessages.countByThread")(
      function* (ids) {
        if (ids.length === 0) return []
        return yield* guard(
          db
            .select({ threadId: threadMessages.threadId, count: count() })
            .from(threadMessages)
            .where(and(inWorkspace, inIds(threadMessages.threadId, ids), eq(threadMessages.contentKind, "Text")))
            .groupBy(threadMessages.threadId)
        ).pipe(Effect.flatMap(decodeCounts))
      },
      Effect.mapError(StoreError.failed("ThreadMessageStore", "countByThread"))
    ),
    insert: Effect.fn("ThreadMessages.insert")(function* (record) {
      yield* guard(
        db.insert(threadMessages).values({
          workspaceId: record.workspaceId,
          id: record.id,
          threadId: record.threadId,
          ...authorColumns(record.author),
          ...viaColumns(record.via),
          publishedAt: DateTime.toDate(record.publishedAt),
          ...contentColumns(record.content)
        }),
        true
      ).pipe(Effect.mapError(storeError("ThreadMessageStore", "insert")))
    }),
    edit: Effect.fn("ThreadMessages.edit")(function* (edited) {
      yield* replaceContent(
        "edit",
        edited.messageId,
        {
          _tag: "Text",
          text: edited.text,
          mentions: edited.mentions,
          revision: edited.revision,
          editedAt: edited.editedAt
        },
        edited.revision - 1
      )
    }),
    delete: Effect.fn("ThreadMessages.delete")(function* (deleted) {
      yield* replaceContent("delete", deleted.messageId, { _tag: "Deleted", deletedAt: deleted.deletedAt }, undefined)
    })
  }
  return ThreadMessageStore.make(workspaceId, driver)
})
/**
 * Provides `ThreadMessageStore.ThreadMessageStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ThreadMessageStore.ThreadMessageStore, make())
