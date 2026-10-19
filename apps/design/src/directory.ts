/**
 * What a directory screen lists: a label over each group, with how many it holds, and a row for each
 * thing in it, to open.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"

const sectionLine = "mt-9 mb-2 flex items-center gap-3 text-item font-medium text-ink"

const sectionLabel = "flex-none whitespace-nowrap"

const sectionCount =
  "inline-grid h-5 min-w-5 flex-none place-items-center bg-subtle px-1.25 text-meta font-medium text-ink-secondary tabular-nums"

const sectionStitch = "h-0 min-w-4 flex-1 border-t border-dashed border-stitch"

const rowButton =
  "group flex min-h-19 w-full cursor-pointer items-center gap-4 bg-transparent ps-3 pe-4 text-start focus-ring-inset hover:bg-hover"

const rowMark =
  "grid size-10 flex-none place-items-center bg-avatar-neutral-bg text-item font-medium text-avatar-neutral-fg uppercase"

const rowText = "flex min-w-0 flex-1 flex-col gap-1"

const rowTitle = "block truncate text-body font-medium text-ink"

const rowMeta = "block truncate text-hint text-ink-secondary"

const rowAction = "flex-none px-3 text-control font-medium whitespace-nowrap text-ink-secondary group-hover:text-ink"

const renderMark = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, letter: string): Html =>
  h.span([h.AriaHidden(true), h.Class(rowMark)], [letter])

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

/**
 * A whole row as one button that sends `onClick`: a square mark with the `mark` letter, the `title` over
 * its `meta`, and the `action` at the right. The button is named by the title and described by the meta.
 */
export const row = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ mark: string; title: string; meta?: string; action?: string; onClick: Message }>
): Html =>
  Button.view(
    {
      onClick: config.onClick,
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel(config.title),
            ...(config.meta === undefined ? [] : [h.AriaDescription(config.meta)]),
            h.Class(rowButton)
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
            config.action === undefined ? h.empty : h.span([h.AriaHidden(true), h.Class(rowAction)], [config.action])
          ]
        )
    },
    h
  )
