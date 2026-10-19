import { ThreadMessage } from "@amends-dev/core/thread"
import { button, buttonRow, column, field, hint, notice, sending, submit, textarea } from "@amends-dev/design/control"
import { form } from "@amends-dev/design/form"
import { divider, message, messageList } from "@amends-dev/design/message"
import { paneColumn } from "@amends-dev/design/pane"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { authorName, initials, messageRuns, repliesLabel, whenLabel } from "../../seen.ts"
import { ReplyBinding, TaskBinding, ThreadComposition, type ThreadViewBuilder, TurnsBinding } from "./composition.ts"
import { Message, type MessageItem, type Model, typingIn } from "./definition.ts"

/** The time now, which the days the messages were published on are read from. */
export type ViewInputs = Readonly<{ now: DateTime.Utc }>

/** The form to change the thread's title, while the person renames it. */
const renamingView = (model: Model, h: ThreadViewBuilder): Html =>
  Option.match(model.renaming, {
    onNone: () => h.empty,
    onSome: (draft) =>
      form(h, { onSubmit: Message.SubmittedRename(), variant: "pane" }, [
        field(
          h,
          {
            id: "title",
            label: "Title",
            type: "text",
            value: draft,
            onInput: (title) => Message.TypedTitle({ title })
          },
          Option.none()
        ),
        buttonRow(h, [submit(h, "Save"), button(h, "Cancel", Message.ClickedCancelRename(), { variant: "quiet" })])
      ])
  })

/** The person's part in the thread: following it, or not, and whether a change to that is on its way. */
const followAction = (model: Model, h: ThreadViewBuilder): Html =>
  Option.match(model.following, {
    onNone: () => button(h, "Follow", Message.ClickedFollow(), { variant: "quiet" }),
    onSome: ({ active, pending }) =>
      pending
        ? sending(h, true)
        : active
          ? button(h, "Unfollow", Message.ClickedUnfollow(), { variant: "quiet" })
          : button(h, "Follow", Message.ClickedFollow(), { variant: "quiet" })
  })

/** Renaming the thread, until the person starts. */
const renameAction = (model: Model, h: ThreadViewBuilder): Html =>
  Option.isNone(model.renaming) ? button(h, "Rename", Message.ClickedRename(), { variant: "quiet" }) : h.empty

/** What to say after a message's time: that it is on its way, or that it was changed. */
const noteOf = (pending: boolean, edited: boolean): string | undefined => {
  if (pending) {
    return "Sending…"
  }

  return edited ? "edited" : undefined
}

/** A message, with editing and deleting for the person's own, and the form to change it while they edit it. */
const messageView = (
  { message: item, pending }: MessageItem,
  model: Model,
  now: DateTime.Utc,
  h: ThreadViewBuilder
): Html => {
  const own =
    ThreadMessage.Author.matchOrElse(
      item.author,
      { Member: ({ memberId }) => memberId === model.memberId },
      () => false
    ) && ThreadMessage.Content.matchOrElse(item.content, { Text: () => true }, () => false)
  const editing = Option.filter(model.editing, ({ messageId }) => messageId === item.id)
  const edited = ThreadMessage.Content.matchOrElse(
    item.content,
    { Text: ({ editedAt }) => editedAt !== null },
    () => false
  )
  const author = authorName(item.author, model.members, model.contacts)

  return message(h, {
    key: item.id,
    mark: initials(author),
    author,
    time: whenLabel(item.publishedAt, now),
    note: noteOf(pending, edited),
    text: messageRuns(item, model.members),
    body: Option.getOrUndefined(
      Option.map(editing, ({ draft }) =>
        form(h, { onSubmit: Message.SubmittedEdit(), variant: "pane" }, [
          textarea(h, { id: "edit", label: "Edit", value: draft, onInput: (text) => Message.TypedEdit({ text }) }),
          buttonRow(h, [submit(h, "Save"), button(h, "Cancel", Message.ClickedCancelEdit(), { variant: "quiet" })])
        ])
      )
    ),
    actions:
      own && !pending && Option.isNone(editing)
        ? [
            button(h, "Edit", Message.ClickedEdit({ messageId: item.id }), { variant: "quiet" }),
            button(h, "Delete", Message.ClickedDelete({ messageId: item.id }), { variant: "quiet" })
          ]
        : []
  })
}

/** The opening message, then, when there are replies, how many, and the replies. */
const messagesView = (model: Model, now: DateTime.Utc, h: ThreadViewBuilder): Html => {
  const [opening, ...replies] = model.messages

  return messageList(h, {
    label: "Messages",
    children: [
      ...(opening === undefined ? [] : [messageView(opening, model, now, h)]),
      ...(replies.length === 0 ? [] : [divider(h, repliesLabel(replies.length), { align: "start" })]),
      ...replies.map((reply) => messageView(reply, model, now, h))
    ]
  })
}

/** Who types in the thread now, besides the person, in a live region so that it is announced as it appears. */
const typingView = (names: ReadonlyArray<string>, h: ThreadViewBuilder): Html =>
  h.div(
    [h.AriaLive("polite")],
    [names.length === 0 ? h.empty : hint(h, `${names.join(" and ")} ${names.length === 1 ? "is" : "are"} typing…`)]
  )

/**
 * The thread as the side pane's body: the person's part in it, the task it tracks and its agents' turns, and
 * its messages, the opening first and the replies after it.
 */
export const view = ThreadComposition.makeView.withInputs<ViewInputs>((model, { now }, h) =>
  h.section(
    [h.AriaLabel("Thread")],
    [
      paneColumn(h, [
        buttonRow(h, [followAction(model, h), renameAction(model, h)]),
        renamingView(model, h),
        h.block(TaskBinding.embedView({ slotId: "task", model: model.task })),
        h.block(TurnsBinding.embedView({ slotId: "turns", model: model.turns })),
        notice(h, model.notice),
        column(h, [messagesView(model, now, h), typingView(typingIn(model), h)])
      ])
    ]
  )
)

/** The composer to reply in the thread, for a pane's footer. */
export const replyView = ThreadComposition.makeView((model, h) =>
  h.block(
    ReplyBinding.embedView({
      slotId: "reply",
      model: model.reply,
      viewInputs: { label: "Reply", submitLabel: "Reply", placeholder: "Reply in thread" }
    })
  )
)
