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
  loadingLine,
  notice,
  submit,
  textarea
} from "@amends-dev/design/control"
import { property } from "@amends-dev/design/details"
import { form } from "@amends-dev/design/form"
import { description, divider, event, message, messageList, note } from "@amends-dev/design/message"
import { pane, paneBack, paneClose, paneColumn, paneEmpty, paneStack } from "@amends-dev/design/pane"
import type { ProfileOpener } from "@amends-dev/design/profile"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html, HtmlBuilder } from "foldkit/html"
import {
  authorMemberId,
  authorName,
  fullTimeOf,
  groupByDay,
  initials,
  isAuthorAgent,
  messageText,
  repliesLabel,
  sideSubtitle,
  statusShape,
  timeOf,
  typingLine,
  whenLabel
} from "../../seen.ts"
import { logPaneView, replyActionView } from "../turns/view.ts"
import { RevealHighlightedMessage } from "./command.ts"
import { ReplyBinding, TaskBinding, ThreadComposition, type ThreadViewBuilder, TurnsBinding } from "./composition.ts"
import {
  aboutOf,
  type Availability,
  availabilityOf,
  Message,
  type MessageItem,
  type Model,
  messagesListId,
  noteOf,
  titleOf,
  typingIn
} from "./definition.ts"
import { Entry, timelineOf, turnPostingReply, whenOf } from "./timeline.ts"

/**
 * The time now, which the days the messages were published on are read from, the trigger whose member's card is open,
 * and, when a notification opened the thread, the message it is about, drawn current so that the person sees what it
 * was about.
 */
export type ViewInputs = Readonly<{
  now: DateTime.Utc
  openTriggerId: string | undefined
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
 * The person's part in the thread as a bell in the pane's header, as `apps/ui` has it: named Follow thread, or
 * Following thread, filled and pressed, while they follow it, which stops following, and unavailable while a change to
 * that is on its way.
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

/** How the messages' authors and the mentions in their texts open the member's card. */
const profilesOf = ({ openTriggerId }: ViewInputs): ProfileOpener<Message> => ({
  scope: "thread",
  openTriggerId,
  open: (memberId, triggerId) => Message.OpenedProfile({ memberId, triggerId })
})

/** How a time in the timeline reads: its time of day under a day's divider, or by its day where no divider says it. */
type TimeLabel = (at: DateTime.Utc) => string

/**
 * A message, with editing and deleting for the person's own, and the form to change it while they edit it, drawn
 * current while it is the one highlighted, and, when it is the reply of an agent's turn, View turn log. Its author's
 * name and mark and the mentions in its text open the member's card.
 */
const messageView = (
  item: MessageItem,
  model: Model,
  inputs: ViewInputs,
  timeLabel: TimeLabel,
  h: ThreadViewBuilder
): Html => {
  const { highlightedMessageId = Option.none() } = inputs
  const edited = ThreadMessage.Content.matchOrElse(
    item.message.content,
    { Text: ({ editedAt }) => editedAt !== null },
    () => false
  )
  const author = authorName(item.message.author, model.members, model.contacts)
  const isCurrent = Option.contains(highlightedMessageId, item.message.id)
  const { body, actions } = editControls(item, model, h)
  const turnActions = Option.match(turnPostingReply(model, item.message.id), {
    onNone: () => [],
    onSome: (turn) => [
      h.block(
        TurnsBinding.embedView({
          slotId: `turn-log-action-${item.message.id}`,
          model: model.turns,
          view: replyActionView,
          viewInputs: { turnId: turn.id }
        })
      )
    ]
  })

  return message(h, {
    key: item.message.id,
    mark: initials(author),
    author,
    authorId: authorMemberId(item.message.author),
    profiles: profilesOf(inputs),
    isAgent: isAuthorAgent(item.message.author, model.members),
    time: timeLabel(item.message.publishedAt),
    note: item.pending ? "Sending…" : undefined,
    text: messageText(item.message, model.members),
    isEdited: edited,
    isCurrent,
    attributes: isCurrent ? [h.OnMount(RevealHighlightedMessage())] : [],
    body,
    actions: [...actions, ...turnActions]
  })
}

/**
 * An entry of the timeline: a message, the row of the agent's turn where it took on the work, which the turns Block
 * draws, or the quiet line of who followed the thread or stopped taking part in it.
 */
const entryView = (
  entry: Entry,
  model: Model,
  inputs: ViewInputs,
  timeLabel: TimeLabel,
  h: ThreadViewBuilder
): ReadonlyArray<Html> =>
  Entry.match(entry, {
    Posted: ({ item }) => [messageView(item, model, inputs, timeLabel, h)],
    Noted: ({ change }) => [
      note(h, {
        key: change.id,
        text: noteOf(model, change),
        time: timeLabel(change.at),
        dateTime: DateTime.formatIso(change.at),
        title: fullTimeOf(change.at)
      })
    ],
    Took: ({ item: { turn } }) => [
      h.block(
        TurnsBinding.embedView({ slotId: `turn-${turn.id}`, model: model.turns, viewInputs: { turnId: turn.id } })
      )
    ]
  })

/**
 * The thread's timeline under a divider for each day, by the person's own clock: the opening message, then, when there
 * are replies, how many, and the replies and the turns of agents that took on the work, as they happened.
 */
const messagesView = (model: Model, inputs: ViewInputs, h: ThreadViewBuilder): Html => {
  const { opening, after } = timelineOf(model)
  const replies = after.filter(Entry.isAnyOf(["Posted"])).length
  const days = groupByDay(
    [...Option.toArray(Option.map(opening, (item) => Entry.Posted({ item }))), ...after],
    whenOf,
    inputs.now
  )
  const repliesDivider = replies > 0 ? [divider(h, repliesLabel(replies), { align: "start" })] : []

  return messageList(h, {
    label: "Messages",
    id: messagesListId(model.threadId),
    children: days.flatMap(({ label, items }, dayIndex) => [
      divider(h, label),
      ...items.flatMap((entry, index) => [
        ...entryView(entry, model, inputs, timeOf, h),
        // The opening is the first of the first day, and the replies it has follow it.
        ...(dayIndex === 0 && index === 0 && Option.isSome(opening) ? repliesDivider : [])
      ])
    ])
  })
}

/** Who types in the thread now, besides the person, in a live region so that it is announced as it appears. */
const typingView = (names: ReadonlyArray<string>, h: ThreadViewBuilder): Html =>
  h.div([h.AriaLive("polite")], Option.toArray(Option.map(typingLine(names), (line) => hint(h, line))))

/**
 * What the task is described by: the thread's opening, as `apps/ui`'s task pane describes a task, under a caption, with
 * Edit and Delete for the person's own, and the form to change it while they edit it. Nothing before the opening is
 * read.
 */
const descriptionView = (model: Model, inputs: ViewInputs, h: ThreadViewBuilder): Html => {
  const { highlightedMessageId = Option.none() } = inputs
  const [opening] = model.messages

  if (opening === undefined) {
    return h.empty
  }

  const { body, actions } = editControls(opening, model, h)
  const isCurrent = Option.contains(highlightedMessageId, opening.message.id)

  return property(h, {
    caption: "Description",
    children: [
      description(h, {
        text: messageText(opening.message, model.members),
        profiles: profilesOf(inputs),
        body,
        actions,
        isCurrent,
        attributes: isCurrent ? [h.OnMount(RevealHighlightedMessage())] : []
      }),
      opening.pending ? hint(h, "Sending…") : h.empty
    ]
  })
}

/**
 * What the task's activity is, under an Activity divider as `apps/ui`'s task pane has it: that the task was created,
 * by whom and when, then the replies to the opening, which is its description, and the turns of agents that took on
 * the work, as they happened. No divider names a day here, so a time that was not today names its day.
 */
const activityView = (task: Task.Task, model: Model, inputs: ViewInputs, h: ThreadViewBuilder): Html => {
  const { after } = timelineOf(model)
  const creator = authorName(task.createdBy, model.members, model.contacts)
  const timeLabel: TimeLabel = (at) => whenLabel(at, inputs.now)

  return column(h, [
    messageList(h, {
      label: "Activity",
      children: [
        divider(h, "Activity", { align: "start" }),
        event(h, { key: "task-created", text: `${creator} created this task · ${timeLabel(task.createdAt)}` }),
        ...after.flatMap((entry) => entryView(entry, model, inputs, timeLabel, h))
      ]
    }),
    typingView(typingIn(model), h)
  ])
}

/**
 * A thread that tracks a task: its properties, its description, and its activity, as `apps/ui` lays a task out.
 */
const taskColumn = (task: Task.Task, model: Model, inputs: ViewInputs, h: ThreadViewBuilder): Html =>
  paneStack(h, [
    renameAction(model, h),
    renamingView(model, h),
    h.block(TaskBinding.embedView({ slotId: "task", model: model.task })),
    descriptionView(model, inputs, h),
    notice(h, model.notice),
    notice(h, model.turns.notice),
    activityView(task, model, inputs, h)
  ])

/** A thread that tracks no task: its title to change, the task it could become, and its timeline. */
const threadColumn = (model: Model, inputs: ViewInputs, h: ThreadViewBuilder): Html =>
  paneColumn(h, [
    renameAction(model, h),
    renamingView(model, h),
    h.block(TaskBinding.embedView({ slotId: "task", model: model.task })),
    notice(h, model.notice),
    notice(h, model.turns.notice),
    column(h, [messagesView(model, inputs, h), typingView(typingIn(model), h)])
  ])

/**
 * What the pane says in place of the thread while it is not shown, as `apps/ui` says it: that it is being read; that it
 * is not available, as it is for a thread in a group the person no longer belongs to; or that it could not be read,
 * with the button to read it again.
 */
const stateView = (availability: Exclude<Availability, "Available">, h: ThreadViewBuilder): Html => {
  switch (availability) {
    case "Loading":
      return loadingLine(h, "Loading the thread…")
    case "Unavailable":
      return paneEmpty(h, {
        art: "held-back",
        title: "This thread isn't available",
        copy: "It may be in a group you no longer belong to."
      })
    case "Failed":
      return paneEmpty(h, {
        art: "came-apart",
        title: "Can't load this thread",
        copy: "Try again once the host is reachable.",
        action: button(h, "Try again", Message.ClickedTryAgain())
      })
  }
}

/**
 * The thread as the side pane's body: its title to change, the task it tracks, and its timeline, the opening first and
 * the replies and the agents' turns after it; or, for a thread that tracks a task, the task's properties, its
 * description, and its activity. Until the store has the thread, or when it has not, the state says so instead.
 */
export const view = ThreadComposition.makeView.withInputs<ViewInputs>((model, inputs, h) => {
  const availability = availabilityOf(model)

  if (availability !== "Available") {
    return h.section([h.AriaLabel("Thread")], [paneColumn(h, [stateView(availability, h)])])
  }

  return Option.match(
    Option.map(model.task.task, ({ task }) => task),
    {
      onNone: () => h.section([h.AriaLabel("Thread")], [threadColumn(model, inputs, h)]),
      onSome: (task) => h.section([h.AriaLabel("Task")], [taskColumn(task, model, inputs, h)])
    }
  )
})

/** Where the turn log is, such as "Thread in #general", which its summary says first. */
export type TurnLogInputs = Readonly<{ where: string }>

/** The log of the turn the person follows, which the turns Block draws as the side pane, in place of the thread. */
export const turnLogView = ThreadComposition.makeView.withInputs<TurnLogInputs>((model, { where }, h) =>
  h.block(TurnsBinding.embedView({ slotId: "turn-log", model: model.turns, view: logPaneView, viewInputs: { where } }))
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
 * in #general", with Close task. Back, which a phone shows in place of Close, is named for where it goes back to. While
 * the thread is not shown the bell is not either, since it would say whether the person follows a thread they have not
 * read, and a thread that is not available has no composer, as in `apps/ui`.
 */
export const sidePane = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: SidePane<Message>
): Html => {
  const tracked = Option.map(config.thread.task.task, ({ task }) => task)
  const about = aboutOf(config.thread)
  const availability = availabilityOf(config.thread)

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
      actions: [
        ...(availability === "Available" ? [config.follow] : []),
        paneClose(h, config.onClose, `Close ${about.toLowerCase()}`)
      ]
    },
    anchor: Option.isNone(tracked) && availability === "Available" ? "bottom" : "top",
    body: [config.body],
    ...(availability === "Unavailable" ? {} : { footer: [config.reply] })
  })
}
