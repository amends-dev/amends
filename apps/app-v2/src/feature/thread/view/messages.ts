/** Message rendering, editing, and timeline entries shared by threads and tasks. */

import { ThreadMessage, type ThreadMessageId } from "@amends-dev/core/thread"
import { button, buttonRow, submit, textarea } from "@amends-dev/design/control"
import { form } from "@amends-dev/design/form"
import { divider, message, messageList, note } from "@amends-dev/design/message"
import type { ProfileOpener } from "@amends-dev/design/profile"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { authorMemberId, authorName, isAuthorAgent } from "../../../data/messages.ts"
import { repliesLabel } from "../../../view/counts.ts"
import { initials } from "../../../view/members.ts"
import { messageText } from "../../../view/messages.ts"
import { fullTimeOf, groupByDay, timeOf } from "../../../view/time.ts"
import { replyActionView, view as turnView } from "../../turns/view.ts"
import { RevealHighlightedMessage } from "../command.ts"
import { type ThreadViewBuilder, TurnsBinding } from "../composition.ts"
import { Message, type MessageItem, type Model, messagesListId } from "../definition.ts"
import { Entry, timelineOf, turnPostingReply, whenOf } from "../timeline.ts"
import { noteOf } from "./wording.ts"

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

/**
 * What the person may do to a message of theirs: the form that changes its text while they edit it, in the place of the
 * text, and, while they do not, Edit and Delete. Nothing for a message that is not theirs, is not text, or is still
 * being posted.
 */
export const editControls = (
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
export const profilesOf = ({ openTriggerId }: ViewInputs): ProfileOpener<Message> => ({
  scope: "thread",
  openTriggerId,
  open: (memberId, triggerId) => Message.OpenedProfile({ memberId, triggerId })
})

/** How a time in the timeline reads: its time of day under a day's divider, or by its day where no divider says it. */
export type TimeLabel = (at: DateTime.Utc) => string

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
export const entryView = (
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
        TurnsBinding.embedView({
          slotId: `turn-${turn.id}`,
          model: model.turns,
          viewInputs: { turnId: turn.id },
          view: turnView
        })
      )
    ]
  })

/**
 * The thread's timeline under a divider for each day, by the person's own clock: the opening message, then, when there
 * are replies, how many, and the replies and the turns of agents that took on the work, as they happened.
 */
export const messagesView = (model: Model, inputs: ViewInputs, h: ThreadViewBuilder): Html => {
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
