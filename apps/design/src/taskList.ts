/**
 * Tasks as `apps/ui`'s group Tasks tab lists them: the labels over the rows, a row for each task that opens it, and
 * the quiet line that stands for the rows when the filters leave none.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { propertyIcon } from "./details.ts"
import { type MarkContent, mark, type TaskStatusShape, taskStatus } from "./mark.ts"

const columns =
  "grid-cols-[1rem_minmax(0,1fr)_7rem_9.25rem_5.5rem] gap-x-3 max-desktop:grid-cols-[1rem_minmax(0,1fr)_9.25rem_4.5rem] max-tablet:grid-cols-[1rem_minmax(0,1fr)_1.5rem_3.5rem]"

const headingsLook = `relative grid h-10 items-start px-3 pt-0.75 text-meta font-medium text-ink-secondary uppercase max-tablet:hidden ${columns}`

const headingTask = "col-span-2 min-w-0 truncate"

const headingStatus = "min-w-0 truncate max-desktop:hidden"

const headingAssignee = "min-w-0 truncate"

const headingActivity = "min-w-0 truncate text-end"

const headingsStitch = "absolute inset-x-0 bottom-0 h-0 border-t border-dashed border-stitch"

const listLook = "m-0 flex list-none flex-col p-0"

const rowLook = `group relative grid min-h-14 w-full cursor-pointer items-center bg-transparent px-3 text-start text-ink-secondary focus-ring-inset hover:bg-hover aria-[current=true]:bg-selected aria-[current=true]:indicator-bar max-tablet:min-h-15 ${columns}`

const titleCell = "flex min-w-0 items-baseline gap-2 max-tablet:flex-col max-tablet:items-start max-tablet:gap-0.5"

const titleLook = "min-w-0 truncate text-item font-medium max-tablet:whitespace-normal"

const titleInks = { open: "text-ink", finished: "text-ink-secondary" }

const placeLook = "max-w-1/3 flex-none truncate text-hint text-ink-secondary max-tablet:max-w-full"

const statusLook = "text-hint max-desktop:hidden"

const assigneeLook = "flex min-w-0 items-center gap-2 text-control"

const assigneeInks = { assigned: "text-ink", unassigned: "text-ink-secondary" }

const assigneeName = "min-w-0 truncate max-tablet:hidden"

const unassignedBox = "grid size-6 flex-none place-items-center"

const activityLook = "text-end text-control leading-4.5 whitespace-nowrap"

const emptyLook = "m-0 px-3 py-8 text-control text-ink-secondary"

const unassignedWord = "Unassigned"

/**
 * What one row of the list says of its task: the `key` that tells it from the others, its `title`, the `status` as a
 * drawing and the word for it, the `place` it is in when the list holds the tasks of several groups, its `assignee` by
 * name and mark, or none, its `activity` as the list words it, such as "2m ago", and whether its task `isFinished`, or
 * its row `isCurrent`, which is the one open beside the list.
 */
export type TaskListRow<Message> = Readonly<{
  key: string
  title: string
  status: Readonly<{ shape: TaskStatusShape; label: string }>
  isFinished?: boolean | undefined
  place?: string | undefined
  assignee?: Readonly<{ name: string; mark: MarkContent }> | undefined
  activity: string
  isCurrent?: boolean | undefined
  onClick: Message
}>

/**
 * The labels of the list's columns, Task, Status, Assignee, and Activity, as `apps/ui` sets them over its rows: at the
 * size and in the case of a quiet caption, over a dashed stitch, 40px in all, in the columns the rows have, and
 * hidden from assistive technology since each row describes itself. From 48rem to 64rem the Status label goes with the
 * status words, and below 48rem the labels are not shown at all. They belong in the pane's `toolbar`, under the search,
 * where they stay while the rows scroll.
 */
export const taskHeadings = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>): Html =>
  h.div(
    [h.AriaHidden(true), h.Class(headingsLook)],
    [
      h.span([h.Class(headingTask)], ["Task"]),
      h.span([h.Class(headingStatus)], ["Status"]),
      h.span([h.Class(headingAssignee)], ["Assignee"]),
      h.span([h.Class(headingActivity)], ["Activity"]),
      h.span([h.Class(headingsStitch)])
    ]
  )

const describeRow = <Message>(row: TaskListRow<Message>): string =>
  [row.place, row.status.label, row.assignee?.name ?? unassignedWord, row.activity]
    .filter((part) => part !== undefined)
    .join(" · ")

const renderTitle = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, row: TaskListRow<Message>): Html =>
  h.span(
    [h.Class(titleCell)],
    [
      h.span([h.Class(`${titleLook} ${row.isFinished === true ? titleInks.finished : titleInks.open}`)], [row.title]),
      row.place === undefined ? h.empty : h.span([h.Class(placeLook)], [row.place])
    ]
  )

const renderAssignee = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  assignee: TaskListRow<Message>["assignee"]
): Html =>
  assignee === undefined
    ? h.span(
        [h.Class(`${assigneeLook} ${assigneeInks.unassigned}`)],
        [
          h.span([h.Class(unassignedBox)], [propertyIcon(h, "users")]),
          h.span([h.Class(assigneeName)], [unassignedWord])
        ]
      )
    : h.span(
        [h.Class(`${assigneeLook} ${assigneeInks.assigned}`)],
        [mark(h, { ...assignee.mark, size: "sm" }), h.span([h.Class(assigneeName)], [assignee.name])]
      )

const renderRow = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, row: TaskListRow<Message>): Html =>
  h.keyed("li")(
    row.key,
    [],
    [
      Button.view(
        {
          onClick: row.onClick,
          toView: (attributes) =>
            h.button(
              [
                ...attributes.button,
                h.AriaLabel(row.title),
                h.AriaDescription(describeRow(row)),
                ...(row.isCurrent === true ? [h.AriaCurrent("true")] : []),
                h.Class(rowLook)
              ],
              [
                taskStatus(h, row.status.shape, { size: "1rem" }),
                renderTitle(h, row),
                h.span([h.Class(statusLook)], [row.status.label]),
                renderAssignee(h, row.assignee),
                h.span([h.Class(activityLook)], [row.activity])
              ]
            )
        },
        h
      )
    ]
  )

/**
 * The tasks as a list named Tasks, a row for each of the `rows`, each one button that sends its `onClick`, 56px tall
 * (60px below 48rem), in the columns of `taskHeadings`: the status drawing at 1rem, the title in medium weight, quiet
 * once its task `isFinished`, with the `place` after it in quiet text, if it has one, the status word, the assignee as
 * a 24px mark and name, or the people icon and "Unassigned" in quiet text, and the activity at the end. The title is
 * cut short with an ellipsis, and below 48rem it wraps instead, with the place under it. The status words go below
 * 64rem, since the drawing says it, and the assignee's name below 48rem, where the mark stands for it. A row that
 * `isCurrent` is the one whose task is open beside the list: filled `selected`, with the 2px bar at its start, and
 * `aria-current="true"`.
 *
 * A row is named by its title and described by what else it says, "#general · To do · Alex Morgan · 2m ago", all of
 * it, whatever the width leaves out; the drawing and the marks are hidden from assistive technology.
 */
export const taskList = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  rows: ReadonlyArray<TaskListRow<Message>>
): Html =>
  h.ul(
    [h.AriaLabel("Tasks"), h.Class(listLook)],
    rows.map((row) => renderRow(h, row))
  )

/**
 * A quiet line, in the place of the list, that says why it holds no rows, 32px under the labels and 12px in from the
 * rows' edge, as `apps/ui` says "No tasks match these filters.".
 */
export const taskListEmpty = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, text: string): Html =>
  h.p([h.Class(emptyLook)], [text])
