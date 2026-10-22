/** The body of a thread or the task it tracks. */

import type { Task } from "@amends-dev/core/task"
import { button, buttonRow, column, field, hint, loadingLine, notice, submit } from "@amends-dev/design/control"
import { property } from "@amends-dev/design/details"
import { form } from "@amends-dev/design/form"
import { description, divider, event, messageList } from "@amends-dev/design/message"
import { paneColumn, paneEmpty, paneStack } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { authorName } from "../../../data/messages.ts"
import { messageText, typingLine } from "../../../view/messages.ts"
import { whenLabel } from "../../../view/time.ts"
import { view as taskView } from "../../task/view.ts"
import { ThreadBlock } from "../block.ts"
import { RevealHighlightedMessage } from "../command.ts"
import { TaskBinding, type ThreadViewBuilder } from "../composition.ts"
import { type Availability, availabilityOf, Message, type Model, typingIn } from "../definition.ts"
import { timelineOf } from "../timeline.ts"
import { editControls, profilesOf, entryView, messagesView, type TimeLabel, type ViewInputs } from "./messages.ts"

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

/** Renaming the thread, until the person starts. */
const renameAction = (model: Model, h: ThreadViewBuilder): Html =>
  Option.isNone(model.renaming)
    ? buttonRow(h, [button(h, "Rename", Message.ClickedRename(), { variant: "quiet" })])
    : h.empty

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
    h.block(TaskBinding.embedView({ slotId: "task", model: model.task, view: taskView })),
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
    h.block(TaskBinding.embedView({ slotId: "task", model: model.task, view: taskView })),
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
        title: "This thread isn’t available",
        copy: "It may be in a group you no longer belong to."
      })
    case "Failed":
      return paneEmpty(h, {
        art: "came-apart",
        title: "Can’t load this thread",
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
export const view = ThreadBlock.makeView.withInputs<ViewInputs>((model, inputs, h) => {
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
