/**
 * What a directory screen lists: a label over each group, with how many it holds, a line that says what a
 * list holds, the labels of a table's columns, a row for each thing in it, to open it or to answer it with a
 * button, a quiet line after a list, and the placeholder rows that stand in for a list while it loads.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { buttonWith } from "./control.ts"
import { activityMark, type MarkContent, type MarkStatus, mark } from "./mark.ts"

const sectionLine = "mt-9 mb-2 flex items-center gap-3 text-item font-medium text-ink"

const sectionLabel = "flex-none whitespace-nowrap"

const sectionCount =
  "inline-grid h-5 min-w-5 flex-none place-items-center bg-subtle px-1.25 text-meta font-medium text-ink-secondary tabular-nums"

const sectionStitch = "h-0 min-w-4 flex-1 border-t border-dashed border-stitch"

const summaryLine = "m-0 flex items-baseline justify-between gap-4 text-hint text-ink-muted"

const summaryCount = "flex-none tabular-nums"

const columnsGroup = "max-tablet:hidden"

const columnsLine = "flex items-center gap-4 ps-3 pe-4 pb-2 text-meta text-ink-muted uppercase"

const columnsTitleLabel = "min-w-0 flex-1 truncate"

const columnsCellLabel = "w-32 flex-none truncate max-desktop:w-24"

const columnsActionSpace = "w-24 flex-none max-desktop:w-20"

const columnsStitch = "h-0 border-t border-dashed border-stitch"

const footnoteLine = "mt-6 text-control text-ink-secondary"

const rowShape = "flex w-full items-center gap-4 ps-3 pe-4"

const rowHeights = { sm: "min-h-14", md: "min-h-19", lg: "min-h-19" }

const rowButton = `${rowShape} group relative cursor-pointer bg-transparent text-start focus-ring-inset hover:bg-hover hover:[--amends-status-knockout:var(--amends-hover)] aria-[current=true]:bg-selected aria-[current=true]:[--amends-status-knockout:var(--amends-selected)] aria-[current=true]:indicator-bar`

const rowFoldsCells = "max-tablet:flex-wrap max-tablet:gap-y-2 max-tablet:py-3"

const rowText = "flex min-w-0 flex-1 flex-col gap-1"

const rowTitle = "block truncate text-body font-medium text-ink"

const rowMeta = "block truncate text-hint text-ink-secondary"

const rowCellsFolded =
  "contents max-tablet:flex max-tablet:basis-full max-tablet:min-w-0 max-tablet:flex-wrap max-tablet:items-center max-tablet:gap-2"

const rowCellsStart = { sm: "max-tablet:ps-10", md: "max-tablet:ps-12", lg: "max-tablet:ps-14" }

const rowCell =
  "block w-32 flex-none text-hint text-ink-secondary max-desktop:w-24 max-tablet:w-auto max-tablet:max-w-full max-tablet:truncate"

const rowAction = "flex-none px-3 text-control font-medium whitespace-nowrap text-ink-secondary group-hover:text-ink"

const rowActionAmongCells = `w-24 text-end max-desktop:w-20 max-tablet:hidden ${rowAction}`

const placeholderRow = "loading-pulse"

const placeholderMarks = { sm: "size-6", md: "size-8", lg: "size-10" }

const placeholderLines = "flex min-w-0 flex-1 flex-col gap-2.5"

const placeholderLine = "h-3 w-[min(16rem,60%)] bg-subtle"

const placeholderShortLine = "h-3 w-[min(9rem,35%)] bg-subtle"

const hiddenStatus = "sr-only"

const cellColumn = "flex min-w-0 flex-col gap-1"

const cellValue = "flex min-w-0 items-center gap-1.5 text-control text-ink"

const cellDetail = "block truncate text-hint text-ink-secondary max-tablet:hidden"

const renderText = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  title: string,
  meta: string | undefined
): Html =>
  h.span(
    [h.Class(rowText)],
    [h.span([h.Class(rowTitle)], [title]), meta === undefined ? h.empty : h.span([h.Class(rowMeta)], [meta])]
  )

const renderAction = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  action: string | undefined,
  hasCells: boolean
): Html => {
  if (hasCells) {
    return h.span([h.AriaHidden(true), h.Class(rowActionAmongCells)], [action ?? ""])
  }

  return action === undefined ? h.empty : h.span([h.AriaHidden(true), h.Class(rowAction)], [action])
}

/**
 * The label over a group of rows, with how many are in it and a dashed line running to the edge, and, when given,
 * an `action` after the line, such as a quiet button that opens the group's history.
 */
export const section = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; count?: number; action?: Html }>
): Html =>
  h.div(
    [h.Class(sectionLine)],
    [
      h.h2([h.Class(sectionLabel)], [config.label]),
      config.count === undefined ? h.empty : h.span([h.Class(sectionCount)], [`${config.count}`]),
      h.div([h.AriaHidden(true), h.Class(sectionStitch)]),
      config.action ?? h.empty
    ]
  )

/** A line of quiet text that says what a list holds, with how many at its end, such as "4 groups". */
export const summary = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ copy: string; count: string }>
): Html => h.p([h.Class(summaryLine)], [h.span([], [config.copy]), h.span([h.Class(summaryCount)], [config.count])])

/**
 * A line of quiet text after a list, 24px under it, that says what else the person can do, such as accept an
 * invitation.
 */
export const footnote = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, text: string): Html =>
  h.p([h.Class(footnoteLine)], [text])

/**
 * What a list shows while it is read for the first time: `count` rows (three unless given) in the shape of a
 * `row` of the same `markSize`, a square of `subtle` where the mark goes and two bars where the title and the
 * meta go, quiet and slowly dimming and brightening, and still when the reader prefers less motion. The rows are
 * hidden from assistive technology; the `label`, such as "Loading agents…", is a live region, a `status`, that
 * only it can read.
 */
export const loadingRows = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; count?: number; markSize?: RowMarkSize }>
): Html => {
  const markSize = config.markSize ?? "lg"

  return h.div(
    [],
    [
      h.p([h.Role("status"), h.Class(hiddenStatus)], [config.label]),
      h.ul(
        [h.AriaHidden(true)],
        Array.from({ length: config.count ?? 3 }, (_, index) =>
          h.keyed("li")(
            `${index}`,
            [h.Class(`${rowShape} ${rowHeights[markSize]} ${placeholderRow}`)],
            [
              h.span([h.Class(`flex-none bg-subtle ${placeholderMarks[markSize]}`)]),
              h.span(
                [h.Class(placeholderLines)],
                [h.span([h.Class(placeholderLine)]), h.span([h.Class(placeholderShortLine)])]
              )
            ]
          )
        )
      )
    ]
  )
}

/**
 * The labels of a table's columns over its `row`s, at the size and in the case of a quiet caption, over a dashed
 * `stitch` rule, hidden from assistive technology since each row describes itself. The `label` is over the mark
 * and the title, and each of the `cells` over the column of its cell, in the order of a row's `cells`. At the end
 * is the room a row with cells keeps for its action, left bare, so the labels stay over their cells. The columns
 * are 8rem wide and the bare room 6rem, 6rem and 5rem from 48rem to 64rem, as a row's are. Below 48rem a row's
 * cells fold under its title, and no column is left to label, so the labels are not shown.
 */
export const columns = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; cells: ReadonlyArray<string> }>
): Html =>
  h.div(
    [h.AriaHidden(true), h.Class(columnsGroup)],
    [
      h.div(
        [h.Class(columnsLine)],
        [
          h.span([h.Class(columnsTitleLabel)], [config.label]),
          ...config.cells.map((label) => h.span([h.Class(columnsCellLabel)], [label])),
          h.span([h.Class(columnsActionSpace)])
        ]
      ),
      h.div([h.Class(columnsStitch)])
    ]
  )

/**
 * A cell of two lines for a `row`: a `value` over a quieter `detail`, such as an agent's harness over its sandbox.
 * Below 48rem, where the cells fold under the title, only the value shows.
 */
export const cellWithDetail = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ value: string; detail?: string }>
): Html =>
  h.span(
    [h.Class(cellColumn)],
    [
      h.span([h.Class(cellValue)], [h.span([h.Class("truncate")], [config.value])]),
      config.detail === undefined ? h.empty : h.span([h.Class(cellDetail)], [config.detail])
    ]
  )

/**
 * A cell of what is at work for a `row`, in the shape of `cellWithDetail`: the logo's mark and the `state`, such
 * as "Working", over the `place` it works, such as "#design".
 */
export const activityCell = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ state: string; place?: string }>
): Html =>
  h.span(
    [h.Class(cellColumn)],
    [
      h.span([h.Class(cellValue)], [activityMark(h), h.span([h.Class("truncate")], [config.state])]),
      config.place === undefined ? h.empty : h.span([h.Class(cellDetail)], [config.place])
    ]
  )

/**
 * How big a row's mark is, which sets how tall the row is: a 24px mark makes a compact row, 32px and 40px a roomy one.
 */
export type RowMarkSize = keyof typeof rowHeights

/**
 * A whole row as one button that sends `onClick`: a square mark of the `mark` letter, 40px, or 32px with
 * `markSize` `md`, or 24px with `sm`, which makes the row 56px tall and not 76px, for a table of people, the `title`
 * over its `meta`, and the `action` at the right. The `status` is a patch on the mark, cut out of the row's own
 * surface, which is `hover`'s while it is hovered. The button is named by the title and then the status's word,
 * "Atlas, Needs setup", and described by the meta. A row that `isCurrent` is the one whose details are open beside
 * the list: it is filled `selected`, with the 2px bar at its start, and is `aria-current="true"`.
 *
 * The `cells`, such as a `badge` and a count, or a `cellWithDetail`, each lie in a column 8rem wide between the
 * title and the action, under the labels `columns` gives them. Like the mark and the action they are hidden from
 * assistive technology, so `cellsText`, what they say in words, such as "Public · 12 members", describes the
 * button after the meta. A row with cells keeps 6rem at its end for its action, right-aligned, whether it has one
 * or not. From 48rem to 64rem the columns are 6rem wide and the action's room 5rem, so a title keeps its room
 * beside three cells.
 *
 * Below 48rem a row with cells folds: the mark, the title, and the meta stay the first line, and the cells wrap
 * under them as a line of their own, 8px apart, in their order, from the title's start, each as wide as it is, or
 * as the line if it is wider, ending in an ellipsis. The action is not shown. The cells lie in one element that is
 * `contents` from 48rem, so that each is a column of the row, and that takes the whole width of its own line
 * below it, which is what breaks the row after the title.
 *
 * An `id` is the button's own, for the app to move focus to a row, such as the one it has just added.
 */
export const row = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    id?: string
    mark: MarkContent
    markSize?: RowMarkSize
    status?: MarkStatus | undefined
    title: string
    meta?: string
    cells?: ReadonlyArray<Html>
    cellsText?: string
    action?: string
    isCurrent?: boolean
    onClick: Message
  }>
): Html => {
  const description = [config.meta, config.cellsText].filter((part) => part !== undefined).join(" · ")
  const hasCells = config.cells !== undefined
  const markSize = config.markSize ?? "lg"

  return Button.view(
    {
      onClick: config.onClick,
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            ...(config.id === undefined ? [] : [h.Id(config.id)]),
            h.AriaLabel(config.status === undefined ? config.title : `${config.title}, ${config.status.label}`),
            ...(description === "" ? [] : [h.AriaDescription(description)]),
            ...(config.isCurrent === true ? [h.AriaCurrent("true")] : []),
            h.Class(
              hasCells
                ? `${rowButton} ${rowHeights[markSize]} ${rowFoldsCells}`
                : `${rowButton} ${rowHeights[markSize]}`
            )
          ],
          [
            mark(h, { ...config.mark, size: markSize, status: config.status }),
            renderText(h, config.title, config.meta),
            config.cells === undefined
              ? h.empty
              : h.span(
                  [h.AriaHidden(true), h.Class(`${rowCellsFolded} ${rowCellsStart[markSize]}`)],
                  config.cells.map((cell) => h.span([h.Class(rowCell)], [cell]))
                ),
            renderAction(h, config.action, hasCells)
          ]
        )
    },
    h
  )
}

/**
 * A row for a thing the person answers and does not open, so the row is not a button: the square mark, 40px unless
 * `markSize` says otherwise, of the `mark` letters or an icon, and the `title` over its `meta`, drawn as `row` draws
 * them, and at the end a button labelled `action` that sends `onClick`, `secondary` unless `variant` makes it
 * `quiet`, as a pending invitation's Revoke is. The row is not `hover`, since it is not what is pressed. The button
 * is named by `actionName`, which begins with the label, such as "Accept invite to Northstar Studio", so that the
 * buttons of several rows are told apart; the mark is hidden from assistive technology, and the title and meta
 * are read as text. The button is disabled while `isDisabled`, as a pending invitation's Revoke is while the invitation
 * is itself on its way.
 */
export const rowWithButton = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    mark: MarkContent
    markSize?: RowMarkSize
    title: string
    meta?: string
    action: string
    actionName: string
    variant?: "secondary" | "quiet"
    isDisabled?: boolean
    onClick: Message
  }>
): Html => {
  const markSize = config.markSize ?? "lg"

  return h.div(
    [h.Class(`${rowShape} ${rowHeights[markSize]}`)],
    [
      mark(h, { ...config.mark, size: markSize }),
      renderText(h, config.title, config.meta),
      Button.view(
        {
          onClick: config.onClick,
          isDisabled: config.isDisabled ?? false,
          toView: (attributes) =>
            buttonWith(h, [...attributes.button, h.AriaLabel(config.actionName)], config.action, {
              variant: config.variant ?? "secondary"
            })
        },
        h
      )
    ]
  )
}
