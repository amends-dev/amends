import type { Presence } from "@amends-dev/core/presence"
import { Task } from "@amends-dev/core/task"
import type { ThreadId } from "@amends-dev/core/thread"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import { button, column, loadingLine, notice, searchField } from "@amends-dev/design/control"
import { summary } from "@amends-dev/design/directory"
import type { MarkContent } from "@amends-dev/design/mark"
import { choiceMenu } from "@amends-dev/design/menu"
import {
  divider,
  message,
  messageList,
  repliesButton,
  replyInThreadButton,
  type ThreadWork,
  taskChip
} from "@amends-dev/design/message"
import { paneEmpty, paneTabs, paneToolbar, paneToolbarStack } from "@amends-dev/design/pane"
import { taskHeadings, taskListEmpty } from "@amends-dev/design/taskList"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html, HtmlBuilder } from "foldkit/html"
import { workingLabel } from "../../agentActivity.ts"
import {
  authorMemberId,
  authorName,
  initials,
  isAuthorAgent,
  memberName,
  pluralize,
  repliesLabel,
  shortTimeOf,
  statusLabel,
  statusShape,
  threadText,
  threadWords,
  timeOf,
  typingLine,
  typingNames
} from "../../seen.ts"
import { assigneeFilterMenu, statusChoices, statusFilterMenu } from "../../taskFilter.ts"
import { noTasksMatch, taskRows } from "../../taskList.ts"
import type { OfferedSlashCommand } from "../composer/definition.ts"
import {
  AssigneeBinding,
  ComposerBinding,
  SortBinding,
  StatusBinding,
  ThreadsComposition,
  type ThreadsViewBuilder
} from "./composition.ts"
import {
  byDay,
  isFiltered,
  isReadFailed,
  openingStacksUnder,
  threadsListId,
  Message,
  type Model,
  membersLine,
  openTaskCount,
  taskSortChoices,
  type ThreadItem,
  tasksOf
} from "./definition.ts"

/**
 * Who could have written the openings, what the group is called and whether it is a team, who belongs to a team as its
 * welcome names them, which of its threads is open, who is present and which thread each types in, the trigger whose
 * member's card is open, the time now, which the days the threads were created on are read from, and the slash
 * commands the composer offers on the Threads tab, none unless given.
 */
export type ViewInputs = Readonly<{
  members: ReadonlyArray<Member.Member>
  groupName: string
  isTeam: boolean
  memberNames: ReadonlyArray<string>
  openThreadId: Option.Option<ThreadId.ThreadId>
  openTriggerId: string | undefined
  present: ReadonlyArray<Presence.Present>
  now: DateTime.Utc
  commands?: ReadonlyArray<OfferedSlashCommand>
}>

/** The group's name, which names its tabs. */
export type TabsInputs = Readonly<{ groupName: string }>

/** The statuses the Tasks tab narrows to: any, then each as the person reads it. */
const taskStatusChoices = statusChoices(Task.Status.literals)

/**
 * The tabs under the group's title, named for the group: its threads, and those that track a task, counted while any
 * is open.
 */
export const tabsView = ThreadsComposition.makeView.withInputs<TabsInputs>((model, { groupName }, h) => {
  const open = openTaskCount(model.threads)

  return paneTabs(h, {
    label: groupName,
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

/** The marks of those who replied to a thread: a person's on the slate ground, an agent's on the lilac. */
const replierMarks = (item: ThreadItem, members: ReadonlyArray<Member.Member>): ReadonlyArray<MarkContent> =>
  item.repliers.map((author): MarkContent => ({
    text: initials(authorName(author, members, [])),
    tone: isAuthorAgent(author, members) ? "lilac" : "slate"
  }))

/** The agents at work in a thread, such as "Yumi working", and who types in it, which the buttons that open it say. */
const threadNotes = (
  item: ThreadItem,
  self: MemberId.MemberId,
  { members, present }: ViewInputs
): Readonly<{ working: ReadonlyArray<ThreadWork>; typing: string | undefined }> => ({
  working: item.working.map(({ memberId, state }) => ({
    state,
    label: workingLabel(memberName(members, memberId), state)
  })),
  typing: Option.getOrUndefined(typingLine(typingNames(present, item.thread.id, self, members)))
})

/**
 * A thread as a message, as `apps/ui`'s timeline draws one: its opening's author, "A thread" until the opening is
 * read, in their tone, with the time of day the thread was created, the title or the opening, stacked under the thread
 * before it without a mark and a name when `openingStacksUnder` says so, the task it tracks as a chip, and under
 * them the button that opens it: how many replies it has and who wrote them, with a dot while any is unread, or "Reply
 * in thread" where it has none, and at its end the agents at work in it and who types in it. A hovered thread also
 * offers the reply as an action. Each of them opens the thread, apart from the author's name and mark and the mentions
 * in the opening, which open the member's card.
 */
const threadRow = (
  item: ThreadItem,
  previous: ThreadItem | undefined,
  { memberId }: Model,
  inputs: ViewInputs,
  h: ThreadsViewBuilder
): Html => {
  const { members, openThreadId } = inputs
  const author = Option.match(item.opening, {
    onNone: () => ({ name: "A thread", mark: "?", isAgent: false, id: undefined }),
    onSome: (opening) => {
      const name = authorName(opening.author, members, [])
      return {
        name,
        mark: initials(name),
        isAgent: isAuthorAgent(opening.author, members),
        id: authorMemberId(opening.author)
      }
    }
  })
  const words = threadWords(item.thread, item.opening, members)
  const open = Message.ClickedThread({ threadId: item.thread.id })
  const isCurrent = Option.exists(openThreadId, (threadId) => threadId === item.thread.id)
  const opens = { onClick: open, description: words, isExpanded: isCurrent, ...threadNotes(item, memberId, inputs) }
  const common = {
    key: item.thread.id,
    mark: author.mark,
    author: author.name,
    authorId: author.id,
    profiles: {
      scope: "threads",
      openTriggerId: inputs.openTriggerId,
      open: (memberId: string, triggerId: string) => Message.OpenedProfile({ memberId, triggerId })
    },
    isAgent: author.isAgent,
    time: timeOf(item.thread.createdAt),
    note: item.pending ? "Sending…" : undefined,
    text: threadText(item.thread, item.opening, members),
    isCurrent,
    hoverActions: [
      { icon: "mark-reply", label: "Reply in thread", onClick: open, description: words, isExpanded: isCurrent }
    ],
    meta: [
      ...Option.toArray(
        Option.map(item.task, (task) =>
          taskChip(h, {
            shape: statusShape[task.status],
            status: statusLabel[task.status],
            title: words,
            onClick: open
          })
        )
      ),
      item.replies === 0
        ? replyInThreadButton(h, opens)
        : repliesButton(h, {
            ...opens,
            marks: replierMarks(item, members),
            label: repliesLabel(item.replies),
            isUnread: item.unread > 0
          })
    ]
  } as const

  return openingStacksUnder(item, previous)
    ? message(h, { ...common, isStacked: true, shortTime: shortTimeOf(item.thread.createdAt) })
    : message(h, common)
}

/**
 * What the group says when nothing was said in it yet: it welcomes the person to a team and says who belongs to it, or
 * to a conversation. A conversation not started says the same.
 */
export const welcome = <Message, Requirements>(
  inputs: Pick<ViewInputs, "groupName" | "isTeam" | "memberNames">,
  h: HtmlBuilder<Message, Requirements>
): Html =>
  paneEmpty(h, {
    art: "caret",
    title: inputs.isTeam ? `Welcome to #${inputs.groupName}` : `Your conversation with ${inputs.groupName}`,
    copy: [
      ...(inputs.isTeam && inputs.memberNames.length > 0 ? [membersLine(inputs.memberNames)] : []),
      "Send the first message to start the conversation."
    ]
  })

/** What a group's conversation says when it could not be read, with the way to read it again. */
export const cantLoadConversation = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  onTryAgain: Message
): Html =>
  paneEmpty(h, {
    art: "came-apart",
    title: "Can't load this conversation",
    copy: "Try again once the host is reachable.",
    action: button(h, "Try again", onTryAgain)
  })

/**
 * The group's threads, oldest first under the days they were created on, each as a message of whoever opened it, as
 * `threadRow` says, or a line that says they are being read, or what the group says when nothing was said in it.
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
            id: threadsListId(model.groupId),
            children: byDay(model.threads, inputs.now).flatMap((day) => [
              divider(h, day.label),
              ...day.items.map((item, index) => threadRow(item, day.items[index - 1], model, inputs, h))
            ])
          })
  ])

/**
 * The threads that track a task, latest active first, as the task list, the one whose thread is open drawn current,
 * or why it lists none: nothing matches what the person narrowed it to, which a quiet line says, or nothing is
 * tracked yet.
 */
const tasksView = (model: Model, inputs: ViewInputs, h: ThreadsViewBuilder): Html => {
  const shown = tasksOf(model, inputs.members)

  return column(h, [
    notice(h, model.notice),
    shown.length > 0
      ? taskRows(
          h,
          shown.map(({ item, task }) => ({
            task,
            thread: item.thread,
            opening: item.opening,
            pending: item.pending,
            lastActiveAt: item.lastActiveAt,
            isCurrent: Option.exists(inputs.openThreadId, (threadId) => threadId === item.thread.id),
            onClick: Message.ClickedThread({ threadId: item.thread.id })
          })),
          { members: inputs.members, now: inputs.now }
        )
      : isFiltered(model)
        ? taskListEmpty(h, noTasksMatch)
        : paneEmpty(h, { art: "fill", title: "No tasks yet", copy: "Start one from the composer below." })
  ])
}

/**
 * The toolbar of the Tasks tab, for the pane that holds the tab: a search and the menus of status and assignee that
 * narrow the tasks, and at its end the menu of the order they are listed in and New task, which moves the focus to the
 * composer; under it, how many tasks the tab lists and the labels of its columns, which stay over the line that says
 * the filters leave none.
 */
export const toolbarView = ThreadsComposition.makeView.withInputs<ViewInputs>((model, inputs, h) => {
  const shown = tasksOf(model, inputs.members)

  return paneToolbarStack(h, [
    paneToolbar(h, {
      start: [
        searchField(h, {
          id: "task-search",
          label: "Search tasks",
          placeholder: "Search tasks…",
          value: model.taskFilter.query,
          onInput: (query) => Message.TypedTaskQuery({ query })
        }),
        statusFilterMenu(h, {
          choices: taskStatusChoices,
          value: model.taskFilter.status,
          embed: (viewInputs) =>
            h.block(StatusBinding.embedView({ slotId: "group-tasks-status", model: model.statusMenu, viewInputs }))
        }),
        assigneeFilterMenu(h, {
          value: model.taskFilter.assignee,
          members: inputs.members,
          embed: (viewInputs) =>
            h.block(
              AssigneeBinding.embedView({ slotId: "group-tasks-assignee", model: model.assigneeMenu, viewInputs })
            )
        })
      ],
      end: [
        choiceMenu(h, {
          choices: taskSortChoices,
          value: model.taskSort,
          name: `Sort: ${taskSortChoices.find(([value]) => value === model.taskSort)?.[1]}`,
          embed: (viewInputs) =>
            h.block(SortBinding.embedView({ slotId: "group-tasks-sort", model: model.sortMenu, viewInputs }))
        }),
        button(h, "New task", Message.ClickedNewTask(), { icon: "mark-new" })
      ]
    }),
    summary(h, { copy: "Threads that track a task.", count: pluralize(shown.length, "task", "tasks") }),
    ...(shown.length === 0 && !isFiltered(model) ? [] : [taskHeadings(h)])
  ])
})

/**
 * What the tab shows: the group's threads, or the tasks they track; or, in place of both, that the conversation could
 * not be read.
 */
export const view = ThreadsComposition.makeView.withInputs<ViewInputs>((model, inputs, h) => {
  if (isReadFailed(model)) {
    return cantLoadConversation(h, Message.ClickedTryAgain())
  }

  return model.tab === "Threads" ? threadsView(model, inputs, h) : tasksView(model, inputs, h)
})

/**
 * The composer to start a thread in the group, for a pane's footer, named by what it shows while it is empty: "Message
 * #general" for a team and "Message Bob" for a conversation; or on the Tasks tab, a thread that tracks a task, "New
 * task in #general".
 */
export const composerView = ThreadsComposition.makeView.withInputs<ViewInputs>(
  (model, { groupName, isTeam, members, commands = [] }, h) => {
    const place = `${isTeam ? "#" : ""}${groupName}`

    return h.block(
      ComposerBinding.embedView({
        slotId: "composer",
        model: model.composer,
        viewInputs: {
          placeholder: model.tab === "Tasks" ? `New task in ${place}` : `Message ${place}`,
          members,
          commands: model.tab === "Tasks" ? [] : commands
        }
      })
    )
  }
)
