import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { editedText, readMarkdown, writeMarkdown } from "../../mentions.ts"
import {
  DeleteMessage,
  EditMessage,
  FollowThread,
  MarkThreadRead,
  RenameThread,
  ScrollMessagesToEnd,
  UnfollowThread
} from "./command.ts"
import { ThreadComposition } from "./composition.ts"
import { Message, type Model, textOf } from "./definition.ts"

/** Whose store the action is written to, and the thread it acts on. */
const inThread = ({ workspaceId, memberId, threadId }: Model) => ({ workspaceId, memberId, threadId })

export const update = ThreadComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedThread: ({ hasThread, title, messages, following, changes, latest, readThrough }) => {
      // Reading it open marks it read through its latest activity, once for each.
      const marking = latest > Math.max(readThrough, model.readRequested)
      // It opens at its end, and stays there while the person is near it as a message or a note is added.
      const opens = !model.hasThread && hasThread
      const grew = messages.length + changes.length > model.messages.length + model.changes.length
      const scrolling = opens || grew ? [ScrollMessagesToEnd({ threadId: model.threadId, onlyIfNearEnd: !opens })] : []
      return {
        model: modifyFields(model, {
          isLoaded: () => true,
          hasThread: () => hasThread,
          title: () => title,
          messages: () => messages,
          following: () => following,
          changes: () => changes,
          latest: () => latest,
          readThrough: () => readThrough,
          readRequested: (requested) => (marking ? latest : requested)
        }),
        commands: [...(marking ? [MarkThreadRead({ ...inThread(model), throughSequence: latest })] : []), ...scrolling]
      }
    },
    ReceivedPeople: ({ members, contacts }) => ({
      model: modifyFields(model, { members: () => members, contacts: () => contacts })
    }),
    ReceivedPresence: ({ present }) => ({ model: modifyFields(model, { present: () => present }) }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedTryAgain: () => ({
      model: modifyFields(model, { notice: () => Option.none(), reads: (reads) => reads + 1 })
    }),
    ClickedRename: () => ({
      model: modifyFields(model, { renaming: () => Option.some(Option.getOrElse(model.title, () => "")) })
    }),
    TypedTitle: ({ title }) => ({ model: modifyFields(model, { renaming: () => Option.some(title) }) }),
    SubmittedRename: () =>
      Option.match(model.renaming, {
        onNone: () => ({ model }),
        onSome: (title) => ({
          model: modifyFields(model, { renaming: () => Option.none() }),
          commands: [RenameThread({ ...inThread(model), title, expectedTitle: Option.getOrNull(model.title) })]
        })
      }),
    ClickedCancelRename: () => ({ model: modifyFields(model, { renaming: () => Option.none() }) }),
    ClickedEdit: ({ messageId }) => ({
      model: modifyFields(model, {
        editing: () =>
          Option.map(textOf(model, messageId), ({ text }) => {
            const read = readMarkdown(text)

            return { messageId, draft: read.text, mentions: read.mentions }
          })
      })
    }),
    TypedEdit: ({ text }) => ({
      model: modifyFields(model, {
        editing: Option.map((editing) => {
          const edited = editedText({ text: editing.draft, mentions: editing.mentions }, text).written

          return modifyFields(editing, { draft: () => edited.text, mentions: () => edited.mentions })
        })
      })
    }),
    SubmittedEdit: () =>
      Option.match(
        Option.flatMap(model.editing, (editing) =>
          Option.map(textOf(model, editing.messageId), ({ revision }) => ({ ...editing, revision }))
        ),
        {
          onNone: () => ({ model }),
          onSome: ({ messageId, draft, mentions, revision }) => ({
            model: modifyFields(model, { editing: () => Option.none() }),
            commands: [
              EditMessage({
                workspaceId: model.workspaceId,
                memberId: model.memberId,
                messageId,
                text: writeMarkdown({ text: draft, mentions }),
                expectedRevision: revision
              })
            ]
          })
        }
      ),
    ClickedCancelEdit: () => ({ model: modifyFields(model, { editing: () => Option.none() }) }),
    ClickedDelete: ({ messageId }) => ({
      model,
      commands: [DeleteMessage({ workspaceId: model.workspaceId, memberId: model.memberId, messageId })]
    }),
    ClickedFollow: () => ({ model, commands: [FollowThread(inThread(model))] }),
    ClickedUnfollow: () =>
      Option.match(model.following, {
        onNone: () => ({ model }),
        onSome: ({ participationId }) => ({
          model,
          commands: [UnfollowThread({ ...inThread(model), participationId })]
        })
      }),
    ToldTyping: () => ({ model: modifyFields(model, { typingTold: () => false }) }),
    CompletedScrollMessagesToEnd: () => ({ model }),
    CompletedRevealHighlightedMessage: () => ({ model }),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
)
