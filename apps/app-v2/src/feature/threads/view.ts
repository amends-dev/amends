import { Task } from "@amends-dev/core/task"
import type { ThreadId } from "@amends-dev/core/thread"
import type { Member } from "@amends-dev/core/workspace"
import { choiceSelect, column, field, fieldGrid, loadingLine, notice } from "@amends-dev/design/control"
import { summary } from "@amends-dev/design/directory"
import { divider, message, messageList, replyLine } from "@amends-dev/design/message"
import { paneEmpty, paneTabs } from "@amends-dev/design/pane"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { authorName, initials, pluralize, repliesLabel, statusLabel, threadRuns, whenLabel } from "../../seen.ts"
import { statusChoices, taskTable } from "../../taskTable.ts"
import { ComposerBinding, ThreadsComposition, type ThreadsViewBuilder } from "./composition.ts"
import { byDay, Message, type Model, openTaskCount, type ThreadItem, tasksOf } from "./definition.ts"

/**
 * Who could have written the openings, what the group is called and whether it is a team, which of its threads is
 * open, and the time now, which the days the threads were created on and when each was are read from.
 */
export type ViewInputs = Readonly<{
  members: ReadonlyArray<Member.Member>
  groupName: string
  isTeam: boolean
  openThreadId: Option.Option<ThreadId.ThreadId>
  now: DateTime.Utc
}>

/** The statuses the Tasks tab narrows to: every one, then each as the person reads it. */
const taskStatusChoices = statusChoices(Task.Status.literals)

/** The tabs under the group's title: its threads, and those that track a task, counted while any is open. */
export const tabsView = ThreadsComposition.makeView((model, h) => {
  const open = openTaskCount(model.threads)

  return paneTabs(h, {
    label: "Group",
    tabs: [
      { label: "Threads", isCurrent: model.tab === "Threads", onClick: Message.ChoseTab({ tab: "Threads" }) },
      {
        label: "Tasks",
        ...(open > 0 ? { count: open } : {}),
        isCurrent: model.tab === "Tasks",
        onClick: Message.ChoseTab({ tab: "Tasks" })
      }
    ]
  })
})

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
 * A thread as a message: its opening's author, "A thread" until the opening is read, and when the thread was
 * created, its title or opening, who replied and how many times, and what is new in it.
 */
const threadRow = (item: ThreadItem, { members, openThreadId, now }: ViewInputs, h: ThreadsViewBuilder): Html => {
  const author = Option.match(item.opening, {
    onNone: () => ({ name: "A thread", mark: "?" }),
    onSome: (opening) => {
      const name = authorName(opening.author, members, [])
      return { name, mark: initials(name) }
    }
  })

  return message(h, {
    key: item.thread.id,
    mark: author.mark,
    author: author.name,
    time: whenLabel(item.thread.createdAt, now),
    note: item.pending ? "Sending…" : undefined,
    text: threadRuns(item.thread, item.opening, members),
    onOpen: Message.ClickedThread({ threadId: item.thread.id }),
    isCurrent: Option.exists(openThreadId, (threadId) => threadId === item.thread.id),
    meta: [
      ...replyMeta(item, members, h),
      ...(item.unread > 0 ? [h.span([], [`${item.unread} new`])] : []),
      ...Option.toArray(Option.map(item.task, (task) => h.span([], [statusLabel[task.status]])))
    ]
  })
}

/** What the group says when nothing was said in it yet: it welcomes the person to a team, or to a conversation. */
const welcome = (inputs: ViewInputs, h: ThreadsViewBuilder): Html =>
  paneEmpty(h, {
    art: "caret",
    title: inputs.isTeam ? `Welcome to #${inputs.groupName}` : `Your conversation with ${inputs.groupName}`,
    copy: "Send the first message to start the conversation."
  })

/**
 * The group's threads, oldest first under the days they were created on, each as a message of whoever opened it, or
 * a line that says they are being read, or what the group says when nothing was said in it.
 */
const threadsView = (model: Model, inputs: ViewInputs, h: ThreadsViewBuilder): Html =>
  column(h, [
    notice(h, model.notice),
    !model.isLoaded
      ? loadingLine(h, "Loading the conversation…")
      : model.threads.length === 0
        ? welcome(inputs, h)
        : messageList(h, {
            label: "Threads",
            children: byDay(model.threads, inputs.now).flatMap((day) => [
              divider(h, day.label),
              ...day.items.map((item) => threadRow(item, inputs, h))
            ])
          })
  ])

/**
 * The threads that track a task, latest active first, as a table under a search and a choice of status that
 * narrow it, with how many it lists, or why it lists none.
 */
const tasksView = (model: Model, inputs: ViewInputs, h: ThreadsViewBuilder): Html => {
  const { status, query } = model.taskFilter
  const shown = tasksOf(model, inputs.members)
  const none =
    query.trim() === "" && status === "All"
      ? ({ art: "fill", title: "No tasks yet", copy: "Start one from the composer below." } as const)
      : ({ art: "nothing-here", title: "No tasks match", copy: "Try a different search or status." } as const)

  return column(h, [
    notice(h, model.notice),
    fieldGrid(h, [
      field(
        h,
        {
          id: "task-search",
          label: "Search tasks",
          type: "search",
          value: query,
          onInput: (query) => Message.TypedTaskQuery({ query }),
          placeholder: "Search tasks…",
          isAutofocus: false,
          isLabelHidden: true
        },
        Option.none()
      ),
      choiceSelect(
        h,
        {
          id: "task-status",
          label: "Status",
          choices: taskStatusChoices,
          value: status,
          onChange: (status) => Message.ChoseTaskStatus({ status })
        },
        { isLabelHidden: true }
      )
    ]),
    summary(h, { copy: "Threads that track a task.", count: pluralize(shown.length, "task", "tasks") }),
    ...(shown.length === 0
      ? [paneEmpty(h, none)]
      : taskTable(
          h,
          shown.map(({ item, task }) => ({
            task,
            thread: item.thread,
            opening: item.opening,
            replies: item.replies,
            pending: item.pending,
            lastActiveAt: item.lastActiveAt,
            groupName: inputs.groupName,
            onClick: Message.ClickedThread({ threadId: item.thread.id })
          })),
          { members: inputs.members, contacts: [], now: inputs.now, hasGroupColumn: false }
        ))
  ])
}

/** What the tab shows: the group's threads, or the tasks they track. */
export const view = ThreadsComposition.makeView.withInputs<ViewInputs>((model, inputs, h) =>
  model.tab === "Threads" ? threadsView(model, inputs, h) : tasksView(model, inputs, h)
)

/**
 * The composer to start a thread in the group, for a pane's footer, or on the Tasks tab, a thread that tracks a
 * task, which a team is named by its `#`.
 */
export const composerView = ThreadsComposition.makeView.withInputs<ViewInputs>(
  (model, { groupName, isTeam, members }, h) =>
    h.block(
      ComposerBinding.embedView({
        slotId: "composer",
        model: model.composer,
        viewInputs:
          model.tab === "Tasks"
            ? {
                label: "New task",
                submitLabel: "Create task",
                placeholder: `New task in ${isTeam ? "#" : ""}${groupName}`,
                members
              }
            : { label: "Start a thread", submitLabel: "Start", placeholder: `Message ${groupName}`, members }
      })
    )
)
