import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { DeleteMessage, EditMessage, FollowThread, MarkThreadRead, RenameThread, UnfollowThread } from "./command.ts"
import { ThreadComposition } from "./composition.ts"
import { Message, type Model, textOf } from "./definition.ts"

/** Whose store the action is written to, and the thread it acts on. */
const inThread = ({ workspaceId, memberId, threadId }: Model) => ({ workspaceId, memberId, threadId })

export const update = ThreadComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedThread: ({ title, messages, following, latest, readThrough }) => {
      // Reading it open marks it read through its latest activity, once for each.
      const marking = latest > Math.max(readThrough, model.readRequested)
      return {
        model: modifyFields(model, {
          title: () => title,
          messages: () => messages,
          following: () => following,
          latest: () => latest,
          readThrough: () => readThrough,
          readRequested: (requested) => (marking ? latest : requested)
        }),
        commands: marking ? [MarkThreadRead({ ...inThread(model), throughSequence: latest })] : []
      }
    },
    ReceivedPeople: ({ members, contacts }) => ({
      model: modifyFields(model, { members: () => members, contacts: () => contacts })
    }),
    ReceivedPresence: ({ present }) => ({ model: modifyFields(model, { present: () => present }) }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
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
        editing: () => Option.map(textOf(model, messageId), ({ text }) => ({ messageId, draft: text }))
      })
    }),
    TypedEdit: ({ text }) => ({
      model: modifyFields(model, { editing: Option.map((editing) => modifyFields(editing, { draft: () => text })) })
    }),
    SubmittedEdit: () =>
      Option.match(
        Option.flatMap(model.editing, (editing) =>
          Option.map(textOf(model, editing.messageId), ({ revision }) => ({ ...editing, revision }))
        ),
        {
          onNone: () => ({ model }),
          onSome: ({ messageId, draft, revision }) => ({
            model: modifyFields(model, { editing: () => Option.none() }),
            commands: [
              EditMessage({
                workspaceId: model.workspaceId,
                memberId: model.memberId,
                messageId,
                text: draft,
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
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
)
