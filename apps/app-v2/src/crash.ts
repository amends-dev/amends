/**
 * What the page shows when the app stops on an unexpected error, as apps/ui's CrashedScreen does: the state art of
 * something that came apart, what happened, and a primary Reload. Foldkit draws it after it has stopped dispatching,
 * so the view has no message to send and Reload is a link to the page's own address, which loads it again. The screen
 * is outside the session, so its header holds the brand alone.
 */

import { centered } from "@amends-dev/design/centered"
import { linkButton } from "@amends-dev/design/control"
import { paneEmpty } from "@amends-dev/design/pane"
import type { Document, HtmlBuilder } from "foldkit/html"

export const crashView = (_context: unknown, h: HtmlBuilder<never>): Document => ({
  title: "Something went wrong",
  body: centered(h, {
    width: "form",
    children: [
      paneEmpty(h, {
        art: "came-apart",
        title: "Something went wrong",
        copy: "amends stopped on an unexpected error. Reloading usually fixes it.",
        action: linkButton(h, { label: "Reload", href: "" }, { variant: "primary" }),
        level: 1
      })
    ]
  })
})
