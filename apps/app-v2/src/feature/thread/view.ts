import type { Group } from "@amends-dev/core/group"
import type { Task } from "@amends-dev/core/task"
import { ThreadMessage, type ThreadMessageId } from "@amends-dev/core/thread"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import {
  button,
  buttonRow,
  column,
  field,
  hint,
  iconButton,
  notice,
  submit,
  textarea
} from "@amends-dev/design/control"
import { property } from "@amends-dev/design/details"
import { form } from "@amends-dev/design/form"
import { description, divider, event, message, messageList } from "@amends-dev/design/message"
import { pane, paneBack, paneClose, paneColumn, paneStack } from "@amends-dev/design/pane"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html, HtmlBuilder } from "foldkit/html"
import { authorName, initials, messageRuns, repliesLabel, sideSubtitle, statusShape, whenLabel } from "../../seen.ts"
import { ReplyBinding, TaskBinding, ThreadComposition, type ThreadViewBuilder, TurnsBinding } from "./composition.ts"
import { Message, type MessageItem, type Model, titleOf, typingIn } from "./definition.ts"

/**
 * The time now, which the days the messages were published on are read from, and, when a notification opened the
 * thread, the message it is about, drawn current so that the person sees what it was about.
 */
export type ViewInputs = Readonly<{
  now: DateTime.Utc
  highlightedMessageId?: Option.Option<ThreadMessageId.ThreadMessageId>
}>

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

/**
 * The person's part in the thread as a bell in the pane's header, as `apps/ui` has it: named Follow thread, or Following
 * thread, filled and pressed, while they follow it, which stops following, and unavailable while a change to that is on
 * its way.
 */
export const followView = ThreadComposition.makeView((model, h) => {
  const isFollowing = Option.exists(model.following, ({ active }) => active)
  const isPending = Option.exists(model.following, ({ pending }) => pending)

  return isFollowing
    ? iconButton(
        h,
        { icon: "bell-filled", label: "Following thread", onClick: Message.ClickedUnfollow() },
        { isPressed: true, isDisabled: isPending }
      )
    : iconButton(
        h,
        { icon: "bell", label: "Follow thread", onClick: Message.ClickedFollow() },
        { isPressed: false, isDisabled: isPending }
      )
})

/** Renaming the thread, until the person starts. */
const renameAction = (model: Model, h: ThreadViewBuilder): Html =>
  Option.isNone(model.renaming)
    ? buttonRow(h, [button(h, "Rename", Message.ClickedRename(), { variant: "quiet" })])
    : h.empty

/** What to say after a message's time: that it is on its way, or that it was changed. */
const noteOf = (pending: boolean, edited: boolean): string | undefined => {
  if (pending) {
    return "Sending…"
  }

  return edited ? "edited" : undefined
}

/**
 * What the person may do to a message of theirs: the form that changes its text while they edit it, in the place of the
 * text, and, while they do not, Edit and Delete. Nothing for a message that is not theirs, is not text, or is still
 * being posted.
 */
const editControls = (
  { message: item, pending }: MessageItem,
  model: Model,
  h: ThreadViewBuilder
): Readonly<{ body: Html | undefined; actions: ReadonlyArray<Html> }> => {
  const own =
    ThreadMessage.Author.matchOrElse(
      item.author,
      { Member: ({ memberId }) => memberId === model.memberId },
      () => false
    ) && ThreadMessage.Content.matchOrElse(item.content, { Text: () => true }, () => false)
  const editing = Option.filter(model.editing, ({ messageId }) => messageId === item.id)

  return {
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
  }
}

/**
 * A message, with editing and deleting for the person's own, and the form to change it while they edit it, drawn
 * current while it is the one highlighted.
 */
const messageView = (
  item: MessageItem,
  model: Model,
  { now, highlightedMessageId = Option.none() }: ViewInputs,
  h: ThreadViewBuilder
): Html => {
  const edited = ThreadMessage.Content.matchOrElse(
    item.message.content,
    { Text: ({ editedAt }) => editedAt !== null },
    () => false
  )
  const author = authorName(item.message.author, model.members, model.contacts)
  const { body, actions } = editControls(item, model, h)

  return message(h, {
    key: item.message.id,
    mark: initials(author),
    author,
    time: whenLabel(item.message.publishedAt, now),
    note: noteOf(item.pending, edited),
    text: messageRuns(item.message, model.members),
    isCurrent: Option.contains(highlightedMessageId, item.message.id),
    body,
    actions
  })
}

/** The opening message, then, when there are replies, how many, and the replies. */
const messagesView = (model: Model, inputs: ViewInputs, h: ThreadViewBuilder): Html => {
  const [opening, ...replies] = model.messages

  return messageList(h, {
    label: "Messages",
    children: [
      ...(opening === undefined ? [] : [messageView(opening, model, inputs, h)]),
      ...(replies.length === 0 ? [] : [divider(h, repliesLabel(replies.length), { align: "start" })]),
      ...replies.map((reply) => messageView(reply, model, inputs, h))
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
 * What the task is described by: the thread's opening, as `apps/ui`'s task pane describes a task, under a caption, with
 * Edit and Delete for the person's own, and the form to change it while they edit it. Nothing before the opening is
 * read.
 */
const descriptionView = (
  model: Model,
  { highlightedMessageId = Option.none() }: ViewInputs,
  h: ThreadViewBuilder
): Html => {
  const [opening] = model.messages

  if (opening === undefined) {
    return h.empty
  }

  const { body, actions } = editControls(opening, model, h)

  return property(h, {
    caption: "Description",
    children: [
      description(h, {
        text: messageRuns(opening.message, model.members),
        body,
        actions,
        isCurrent: Option.contains(highlightedMessageId, opening.message.id)
      }),
      opening.pending ? hint(h, "Sending…") : h.empty
    ]
  })
}

/**
 * What the task's activity is, under an Activity divider as `apps/ui`'s task pane has it: that the task was created,
 * by whom and when, then the replies to the opening, which is its description.
 */
const activityView = (task: Task.Task, model: Model, inputs: ViewInputs, h: ThreadViewBuilder): Html => {
  const [, ...replies] = model.messages
  const creator = authorName(task.createdBy, model.members, model.contacts)

  return column(h, [
    messageList(h, {
      label: "Activity",
      children: [
        divider(h, "Activity", { align: "start" }),
        event(h, {
          key: "task-created",
          text: `${creator} created this task · ${whenLabel(task.createdAt, inputs.now)}`
        }),
        ...replies.map((reply) => messageView(reply, model, inputs, h))
      ]
    }),
    typingView(typingIn(model), h)
  ])
}

/**
 * A thread that tracks a task: its properties, its description, its turns, and its activity, as `apps/ui` lays a task
 * out.
 */
const taskColumn = (task: Task.Task, model: Model, inputs: ViewInputs, h: ThreadViewBuilder): Html =>
  paneStack(h, [
    renameAction(model, h),
    renamingView(model, h),
    h.block(TaskBinding.embedView({ slotId: "task", model: model.task })),
    descriptionView(model, inputs, h),
    h.block(TurnsBinding.embedView({ slotId: "turns", model: model.turns })),
    notice(h, model.notice),
    activityView(task, model, inputs, h)
  ])

/** A thread that tracks no task: its title to change, the task it could become, its turns, and its messages. */
const threadColumn = (model: Model, inputs: ViewInputs, h: ThreadViewBuilder): Html =>
  paneColumn(h, [
    renameAction(model, h),
    renamingView(model, h),
    h.block(TaskBinding.embedView({ slotId: "task", model: model.task })),
    h.block(TurnsBinding.embedView({ slotId: "turns", model: model.turns })),
    notice(h, model.notice),
    column(h, [messagesView(model, inputs, h), typingView(typingIn(model), h)])
  ])

/**
 * The thread as the side pane's body: its title to change, the task it tracks and its agents' turns, and its messages,
 * the opening first and the replies after it; or, for a thread that tracks a task, the task's properties, its
 * description, its turns, and its activity.
 */
export const view = ThreadComposition.makeView.withInputs<ViewInputs>((model, inputs, h) =>
  Option.match(
    Option.map(model.task.task, ({ task }) => task),
    {
      onNone: () => h.section([h.AriaLabel("Thread")], [threadColumn(model, inputs, h)]),
      onSome: (task) => h.section([h.AriaLabel("Task")], [taskColumn(task, model, inputs, h)])
    }
  )
)

/** The composer to reply in the thread, for a pane's footer. */
export const replyView = ThreadComposition.makeView((model, h) =>
  h.block(
    ReplyBinding.embedView({
      slotId: "reply",
      model: model.reply,
      viewInputs: { placeholder: "Reply in thread", members: model.members }
    })
  )
)

/**
 * What a thread's side pane is given besides the thread: where it is, where it goes back to, and the thread's own views
 * as the parent embeds them.
 */
export type SidePane<Message> = Readonly<{
  thread: Model
  /** The thread's group, once it is read. */
  group: Option.Option<Group.Group>
  members: ReadonlyArray<Member.Member>
  self: MemberId.MemberId
  /** What the pane's Back is named for, such as the group, the Tasks tab, or the inbox. */
  backTo: string
  /** The line under the title, in place of the thread's or the task's place, such as why a notification came. */
  subtitle?: string | undefined
  /** What Back and Close send. */
  onClose: Message
  /** The thread's `followView`, the bell in the header. */
  follow: Html
  /** The thread's `view`. */
  body: Html
  /** The thread's `replyView`. */
  reply: Html
}>

/**
 * The thread open as the side pane, as `apps/ui` has it: a thread is titled by a message and subtitled "Thread in
 * #general", with the bell that follows it and Close thread; a thread that tracks a task by its status, subtitled "Task
 * in #general", with Close task. Back, which a phone shows in place of Close, is named for where it goes back to.
 */
export const sidePane = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: SidePane<Message>
): Html => {
  const tracked = Option.map(config.thread.task.task, ({ task }) => task)
  const about = Option.isSome(tracked) ? "Task" : "Thread"

  return pane(h, {
    variant: "side",
    label: about,
    header: {
      title: titleOf(config.thread),
      ...Option.match(tracked, {
        onNone: () => ({ icon: "message" as const }),
        onSome: (task) => ({ taskStatus: statusShape[task.status] })
      }),
      subtitle: config.subtitle ?? sideSubtitle(about, config.group, config.members, config.self),
      leading: paneBack(h, config.onClose, `Back to ${config.backTo}`),
      actions: [config.follow, paneClose(h, config.onClose, `Close ${about.toLowerCase()}`)]
    },
    body: [config.body],
    footer: [config.reply]
  })
}
