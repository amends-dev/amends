/**
 * What a directory screen lists: a label over each group, with how many it holds, a line that says what a
 * list holds, the labels of a table's columns, and a row for each thing in it, to open.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"

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

const rowButton =
  "group flex min-h-19 w-full cursor-pointer items-center gap-4 bg-transparent ps-3 pe-4 text-start focus-ring-inset hover:bg-hover"

const rowFoldsCells = "max-tablet:flex-wrap max-tablet:gap-y-2 max-tablet:py-3"

const rowMark =
  "grid size-10 flex-none place-items-center bg-avatar-neutral-bg text-item font-medium text-avatar-neutral-fg uppercase"

const rowText = "flex min-w-0 flex-1 flex-col gap-1"

const rowTitle = "block truncate text-body font-medium text-ink"

const rowMeta = "block truncate text-hint text-ink-secondary"

const rowCells =
  "contents max-tablet:flex max-tablet:basis-full max-tablet:min-w-0 max-tablet:flex-wrap max-tablet:items-center max-tablet:gap-2 max-tablet:ps-14"

const rowCell =
  "block w-32 flex-none text-hint text-ink-secondary max-desktop:w-24 max-tablet:w-auto max-tablet:max-w-full max-tablet:truncate"

const rowAction = "flex-none px-3 text-control font-medium whitespace-nowrap text-ink-secondary group-hover:text-ink"

const rowActionAmongCells = `w-24 text-end max-desktop:w-20 max-tablet:hidden ${rowAction}`

const renderMark = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, letter: string): Html =>
  h.span([h.AriaHidden(true), h.Class(rowMark)], [letter])

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

/** The label over a group of rows, with how many are in it and a dashed line running to the edge. */
export const section = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; count?: number }>
): Html =>
  h.div(
    [h.Class(sectionLine)],
    [
      h.h2([h.Class(sectionLabel)], [config.label]),
      config.count === undefined ? h.empty : h.span([h.Class(sectionCount)], [`${config.count}`]),
      h.div([h.AriaHidden(true), h.Class(sectionStitch)])
    ]
  )

/** A line of quiet text that says what a list holds, with how many at its end, such as "4 groups". */
export const summary = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ copy: string; count: string }>
): Html => h.p([h.Class(summaryLine)], [h.span([], [config.copy]), h.span([h.Class(summaryCount)], [config.count])])

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
 * A whole row as one button that sends `onClick`: a square mark with the `mark` letter, the `title` over
 * its `meta`, and the `action` at the right. The button is named by the title and described by the meta.
 *
 * The `cells`, such as a `badge` and a count, each lie in a column 8rem wide between the title and the action,
 * under the labels `columns` gives them. Like the mark and the action they are hidden from assistive technology,
 * so `cellsText`, what they say in words, such as "Public · 12 members", describes the button after the meta. A
 * row with cells keeps 6rem at its end for its action, right-aligned, whether it has one or not. From 48rem to
 * 64rem the columns are 6rem wide and the action's room 5rem, so a title keeps its room beside three cells.
 *
 * Below 48rem a row with cells folds: the mark, the title, and the meta stay the first line, and the cells wrap
 * under them as a line of their own, 8px apart, in their order, from the title's start, each as wide as it is, or
 * as the line if it is wider, ending in an ellipsis. The action is not shown. The cells lie in one element that is
 * `contents` from 48rem, so that each is a column of the row, and that takes the whole width of its own line
 * below it, which is what breaks the row after the title.
 */
export const row = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    mark: string
    title: string
    meta?: string
    cells?: ReadonlyArray<Html>
    cellsText?: string
    action?: string
    onClick: Message
  }>
): Html => {
  const description = [config.meta, config.cellsText].filter((part) => part !== undefined).join(" · ")
  const hasCells = config.cells !== undefined

  return Button.view(
    {
      onClick: config.onClick,
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel(config.title),
            ...(description === "" ? [] : [h.AriaDescription(description)]),
            h.Class(hasCells ? `${rowButton} ${rowFoldsCells}` : rowButton)
          ],
          [
            renderMark(h, config.mark),
            h.span(
              [h.Class(rowText)],
              [
                h.span([h.Class(rowTitle)], [config.title]),
                config.meta === undefined ? h.empty : h.span([h.Class(rowMeta)], [config.meta])
              ]
            ),
            config.cells === undefined
              ? h.empty
              : h.span(
                  [h.AriaHidden(true), h.Class(rowCells)],
                  config.cells.map((cell) => h.span([h.Class(rowCell)], [cell]))
                ),
            renderAction(h, config.action, hasCells)
          ]
        )
    },
    h
  )
}
