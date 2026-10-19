import type { ThreadId } from "@amends-dev/core/thread"
import type { Member } from "@amends-dev/core/workspace"
import { hint, notice } from "@amends-dev/design/control"
import { divider, message, messageList, replyLine } from "@amends-dev/design/message"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { authorName, initials, repliesLabel, statusLabel, threadLabel, whenLabel } from "../../seen.ts"
import { ComposerBinding, ThreadsComposition, type ThreadsViewBuilder } from "./composition.ts"
import { byDay, Message, type ThreadItem } from "./definition.ts"

/**
 * Who could have written the openings, what the group is called, which of its threads is open, and the time
 * now, which the days the threads opened on and when each did are read from.
 */
export type ViewInputs = Readonly<{
  members: ReadonlyArray<Member.Member>
  groupName: string
  openThreadId: Option.Option<ThreadId.ThreadId>
  now: DateTime.Utc
}>

/** The line under a thread's row that says who replied and how many replies there are, or nothing while it has none. */
const replyMeta = (
  item: ThreadItem,
  members: ReadonlyArray<Member.Member>,
  h: ThreadsViewBuilder
): ReadonlyArray<Html> =>
  item.replies === 0
    ? []
    : [
        replyLine(h, {
          marks: item.repliers.map((author) => initials(authorName(author, members, []))),
          label: repliesLabel(item.replies)
        })
      ]

/**
 * A thread as a message: its opening's author and when, its title or opening, who replied and how many times, and
 * what is new in it.
 */
const threadRow = (item: ThreadItem, { members, openThreadId, now }: ViewInputs, h: ThreadsViewBuilder): Html => {
  const author = Option.match(item.opening, {
    onNone: () => ({ name: "A thread", mark: "?", time: undefined }),
    onSome: (opening) => {
      const name = authorName(opening.author, members, [])
      return { name, mark: initials(name), time: whenLabel(opening.publishedAt, now) }
    }
  })

  return message(h, {
    key: item.thread.id,
    mark: author.mark,
    author: author.name,
    time: author.time,
    note: item.pending ? "Sending…" : undefined,
    text: threadLabel(item.thread, item.opening),
    onOpen: Message.ClickedThread({ threadId: item.thread.id }),
    isCurrent: Option.exists(openThreadId, (threadId) => threadId === item.thread.id),
    meta: [
      ...replyMeta(item, members, h),
      ...(item.unread > 0 ? [h.span([], [`${item.unread} new`])] : []),
      ...Option.toArray(Option.map(item.task, (task) => h.span([], [statusLabel[task.status]])))
    ]
  })
}

/** The group's threads under the days they opened on, each as a message of whoever opened it, the open one marked. */
export const view = ThreadsComposition.makeView.withInputs<ViewInputs>((model, inputs, h) =>
  h.div(
    [],
    [
      notice(h, model.notice),
      model.threads.length === 0
        ? hint(h, "No threads yet.")
        : messageList(h, {
            label: "Threads",
            children: byDay(model.threads, inputs.now).flatMap((day) => [
              divider(h, day.label),
              ...day.items.map((item) => threadRow(item, inputs, h))
            ])
          })
    ]
  )
)

/** The composer to start a thread in the group, for a pane's footer. */
export const composerView = ThreadsComposition.makeView.withInputs<ViewInputs>((model, { groupName }, h) =>
  h.block(
    ComposerBinding.embedView({
      slotId: "composer",
      model: model.composer,
      viewInputs: { label: "Start a thread", submitLabel: "Start", placeholder: `Message ${groupName}` }
    })
  )
)
