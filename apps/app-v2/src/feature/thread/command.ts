/**
 * What the person does in the thread, each an action written to their store, and saying that they
 * type there, over HTTP, since no replica holds it.
 */

import { Presence } from "@amends-dev/core/presence"
import { ReadState } from "@amends-dev/core/read-state"
import { Thread, ThreadId, ThreadMessage, ThreadMessageId, ThreadParticipationId } from "@amends-dev/core/thread"
import { WorkspaceId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Api from "../../api.ts"
import { followEnd, revealMessage, scrollToEnd } from "../../conversationScroll.ts"
import * as Stores from "../../store/Stores.ts"
import { Message, messagesListId, ThreadDefinition } from "./definition.ts"

const posted = [Message.WroteAction, Message.FailedWriteAction]

/** Why `error` kept the action from being written, as the person reads it. */
const failed = (error: string) => Message.FailedWriteAction({ error })

/** Reply in `threadId` with `text`. */
export const PostReply = ThreadDefinition.command("PostReply", {
  args: { ...Stores.AsMember, threadId: ThreadId.ThreadId, text: Schema.String },
  messages: posted,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ threadId, text, ...member }) =>
      Stores.decoded(
        ThreadMessage.PublishInput,
        { threadId, text, mentions: ThreadMessage.mentionedIn(text) },
        failed("A reply needs some text.")
      ).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("ThreadMessagePosted", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Rename `threadId` to `title`, from the title the person saw. */
export const RenameThread = ThreadDefinition.command("RenameThread", {
  args: {
    ...Stores.AsMember,
    threadId: ThreadId.ThreadId,
    title: Schema.String,
    expectedTitle: Schema.NullOr(Schema.String)
  },
  messages: posted,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ threadId, title, expectedTitle, ...member }) =>
      Stores.decoded(
        Thread.RenameInput,
        { threadId, title, expectedTitle },
        failed("A thread’s title needs some text.")
      ).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("ThreadRenamed", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Change the text of `messageId`, from the revision the person saw. */
export const EditMessage = ThreadDefinition.command("EditMessage", {
  args: {
    ...Stores.AsMember,
    messageId: ThreadMessageId.ThreadMessageId,
    text: Schema.String,
    expectedRevision: Schema.Int
  },
  messages: posted,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ messageId, text, expectedRevision, ...member }) =>
      Stores.decoded(
        ThreadMessage.EditInput,
        { messageId, text, mentions: ThreadMessage.mentionedIn(text), expectedRevision },
        failed("A message needs some text.")
      ).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("ThreadMessageEdited", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Delete `messageId`. */
export const DeleteMessage = ThreadDefinition.command("DeleteMessage", {
  args: { ...Stores.AsMember, messageId: ThreadMessageId.ThreadMessageId },
  messages: posted,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ messageId, ...member }) => write(member, (store) => store.write("ThreadMessageDeleted", { messageId }))
  }
})

/** Follow `threadId`. */
export const FollowThread = ThreadDefinition.command("FollowThread", {
  args: { ...Stores.AsMember, threadId: ThreadId.ThreadId },
  messages: posted,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ threadId, ...member }) => write(member, (store) => store.write("ThreadFollowed", { threadId }))
  }
})

/** Stop following `threadId`, ending the person's participation in it. */
export const UnfollowThread = ThreadDefinition.command("UnfollowThread", {
  args: {
    ...Stores.AsMember,
    threadId: ThreadId.ThreadId,
    participationId: ThreadParticipationId.ThreadParticipationId
  },
  messages: posted,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ threadId, participationId, ...member }) =>
      write(member, (store) => store.write("ThreadUnfollowed", { threadId, participationId }))
  }
})

/** Note that the person read `threadId` through `throughSequence`. */
export const MarkThreadRead = ThreadDefinition.command("MarkThreadRead", {
  args: { ...Stores.AsMember, threadId: ThreadId.ThreadId, throughSequence: Schema.Int },
  messages: posted,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
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

/**
 * Scroll the messages of `threadId` to their end once they are drawn, so that the thread opens there, unless a message
 * is the current one, which a notification came for; or, with `onlyIfNearEnd`, only if the person was near their end,
 * so that what is added stays in view while they are there and leaves them where they scrolled to when they are not.
 */
export const ScrollMessagesToEnd = ThreadDefinition.command("ScrollMessagesToEnd", {
  args: { threadId: ThreadId.ThreadId, onlyIfNearEnd: Schema.Boolean },
  messages: [Message.CompletedScrollMessagesToEnd],
  handler: function* () {
    return ({ threadId, onlyIfNearEnd }) =>
      (onlyIfNearEnd
        ? followEnd(messagesListId(threadId))
        : scrollToEnd(messagesListId(threadId), { unlessCurrent: true })
      ).pipe(Effect.as(Message.CompletedScrollMessagesToEnd()))
  }
})

/**
 * Scroll the message it is mounted on to the middle of the pane when it is drawn, so that the person sees what a
 * notification came for.
 */
export const RevealHighlightedMessage = ThreadDefinition.mount("RevealHighlightedMessage", {
  messages: [Message.CompletedRevealHighlightedMessage],
  handler: function* () {
    return ({ element }) => Effect.as(revealMessage(element), Message.CompletedRevealHighlightedMessage())
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
  TellTyping.layer,
  ScrollMessagesToEnd.layer,
  RevealHighlightedMessage.layer
)
