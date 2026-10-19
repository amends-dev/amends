/**
 * What the person does in the thread, each an action written to their store, and saying that they
 * type there, over HTTP, since no replica holds it.
 */

import { Presence } from "@amends-dev/core/presence"
import { ReadState } from "@amends-dev/core/read-state"
import { Thread, ThreadId, ThreadMessage, ThreadMessageId, ThreadParticipationId } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Api from "../../api.ts"
import type * as Store from "../../store/Store.ts"
import * as Stores from "../../store/Stores.ts"
import { Message, ThreadDefinition } from "./definition.ts"

/** Whose store the action is written to. */
const asMember = { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId }
type AsMember = { readonly workspaceId: WorkspaceId.WorkspaceId; readonly memberId: MemberId.MemberId }

/** Write with `to` to the member's store, and say so, or why it could not be kept. */
const writing =
  (stores: Stores.Stores["Service"]) =>
  <E>({ workspaceId, memberId }: AsMember, to: (store: Store.Store["Service"]) => Effect.Effect<unknown, E>) =>
    stores.write(workspaceId, memberId, to).pipe(
      Effect.as(Message.WroteAction()),
      Effect.catchCause(() => Effect.succeed(Message.FailedWriteAction({ error: Stores.unwritable })))
    )

/** `input` decoded by `schema`, or why it was refused, as the person reads it. */
const decoded = <S extends Schema.Top>(schema: S, input: S["Encoded"], refused: string) =>
  Schema.decodeEffect(schema)(input).pipe(Effect.mapError(() => Message.FailedWriteAction({ error: refused })))

const posted = [Message.WroteAction, Message.FailedWriteAction]

/** Reply in `threadId` with `text`. */
export const PostReply = ThreadDefinition.command("PostReply", {
  args: { ...asMember, threadId: ThreadId.ThreadId, text: Schema.String },
  messages: posted,
  handler: function* () {
    const write = writing(yield* Stores.Stores)
    return ({ threadId, text, ...member }) =>
      decoded(ThreadMessage.PublishInput, { threadId, text, mentions: [] }, "A reply needs some text.").pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("ThreadMessagePosted", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Rename `threadId` to `title`, from the title the person saw. */
export const RenameThread = ThreadDefinition.command("RenameThread", {
  args: { ...asMember, threadId: ThreadId.ThreadId, title: Schema.String, expectedTitle: Schema.NullOr(Schema.String) },
  messages: posted,
  handler: function* () {
    const write = writing(yield* Stores.Stores)
    return ({ threadId, title, expectedTitle, ...member }) =>
      decoded(Thread.RenameInput, { threadId, title, expectedTitle }, "A thread's title needs some text.").pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("ThreadRenamed", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Change the text of `messageId`, from the revision the person saw. */
export const EditMessage = ThreadDefinition.command("EditMessage", {
  args: { ...asMember, messageId: ThreadMessageId.ThreadMessageId, text: Schema.String, expectedRevision: Schema.Int },
  messages: posted,
  handler: function* () {
    const write = writing(yield* Stores.Stores)
    return ({ messageId, text, expectedRevision, ...member }) =>
      decoded(
        ThreadMessage.EditInput,
        { messageId, text, mentions: [], expectedRevision },
        "A message needs some text."
      ).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("ThreadMessageEdited", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Delete `messageId`. */
export const DeleteMessage = ThreadDefinition.command("DeleteMessage", {
  args: { ...asMember, messageId: ThreadMessageId.ThreadMessageId },
  messages: posted,
  handler: function* () {
    const write = writing(yield* Stores.Stores)
    return ({ messageId, ...member }) => write(member, (store) => store.write("ThreadMessageDeleted", { messageId }))
  }
})

/** Follow `threadId`. */
export const FollowThread = ThreadDefinition.command("FollowThread", {
  args: { ...asMember, threadId: ThreadId.ThreadId },
  messages: posted,
  handler: function* () {
    const write = writing(yield* Stores.Stores)
    return ({ threadId, ...member }) => write(member, (store) => store.write("ThreadFollowed", { threadId }))
  }
})

/** Stop following `threadId`, ending the person's participation in it. */
export const UnfollowThread = ThreadDefinition.command("UnfollowThread", {
  args: { ...asMember, threadId: ThreadId.ThreadId, participationId: ThreadParticipationId.ThreadParticipationId },
  messages: posted,
  handler: function* () {
    const write = writing(yield* Stores.Stores)
    return ({ threadId, participationId, ...member }) =>
      write(member, (store) => store.write("ThreadUnfollowed", { threadId, participationId }))
  }
})

/** Note that the person read `threadId` through `throughSequence`. */
export const MarkThreadRead = ThreadDefinition.command("MarkThreadRead", {
  args: { ...asMember, threadId: ThreadId.ThreadId, throughSequence: Schema.Int },
  messages: posted,
  handler: function* () {
    const write = writing(yield* Stores.Stores)
    return ({ threadId, throughSequence, ...member }) =>
      Schema.decodeEffect(ReadState.MarkThreadReadInput)({ threadId, throughSequence }).pipe(
        Effect.matchEffect({
          onFailure: () => Effect.succeed(Message.WroteAction()),
          onSuccess: (input) => write(member, (store) => store.write("ThreadMarkedRead", input))
        })
      )
  }
})

/**
 * Say the person types in `threadId`, or, given none, that they stopped; then, while they type, wait
 * as long as typing goes without being said again, so it is said at most that often.
 */
export const TellTyping = ThreadDefinition.command("TellTyping", {
  args: { workspaceId: WorkspaceId.WorkspaceId, threadId: Schema.NullOr(ThreadId.ThreadId) },
  messages: [Message.ToldTyping],
  handler: function* () {
    return ({ workspaceId, threadId }) =>
      Effect.gen(function* () {
        const client = yield* Api.asMember(workspaceId)
        yield* Effect.ignore(client.presence.type({ payload: { threadId } }))
        if (threadId !== null) yield* Effect.sleep(Presence.typingRepeats)
        return Message.ToldTyping()
      }).pipe(Effect.orElseSucceed(() => Message.ToldTyping()))
  }
})

export const EffectsLayer = Layer.mergeAll(
  PostReply.layer,
  RenameThread.layer,
  EditMessage.layer,
  DeleteMessage.layer,
  FollowThread.layer,
  UnfollowThread.layer,
  MarkThreadRead.layer,
  TellTyping.layer
)
