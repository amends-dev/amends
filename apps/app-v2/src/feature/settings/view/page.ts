/** The shared frame and loading states of settings pages. */

import { button, loadingLine } from "@amends-dev/design/control"
import type { IconName } from "@amends-dev/design/icon"
import { pane, paneColumn, paneEmpty } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import type { SettingsViewBuilder } from "../composition.ts"
import { type Failure, Message, type Model, workspaceName } from "../definition.ts"
import { failureView } from "./feedback.ts"

/** What the settings say when they could not be read, which refreshing reads again. */
const unreadable: Failure = { action: "Read", reason: "Outdated" }

/**
 * A page of the settings, the main content: titled, with the workspace's name under the title on phones, the toolbar
 * of a list once the workspace is read, and, while it is not, what says so, or that it could not be, with a way to try
 * again.
 */
export const settingsPage = (
  h: SettingsViewBuilder,
  model: Model,
  config: Readonly<{
    title: string
    icon: IconName
    context?: string
    actions?: ReadonlyArray<Html>
    toolbar?: ReadonlyArray<Html>
    isWide?: boolean
    body: ReadonlyArray<Html>
  }>
): Html => {
  const name = workspaceName(model)

  return pane(h, {
    variant: "main",
    label: config.title,
    header: {
      title: config.title,
      icon: config.icon,
      ...(name === "" ? {} : { phoneContext: name }),
      ...(config.context === undefined ? {} : { context: config.context }),
      ...(config.actions === undefined ? {} : { actions: config.actions })
    },
    ...(config.toolbar === undefined || Option.isNone(model.workspace) ? {} : { toolbar: config.toolbar }),
    body: [
      Option.isSome(model.workspace)
        ? paneColumn(
            h,
            [failureView(model.isUnreadable ? Option.some(unreadable) : Option.none(), h), ...config.body],
            {
              isWide: config.isWide === true
            }
          )
        : model.isUnreadable
          ? paneEmpty(h, {
              art: "came-apart",
              title: "Can’t load settings",
              copy: "Try again once the host is reachable.",
              action: button(h, "Try again", Message.ClickedRefresh())
            })
          : loadingLine(h, "Loading settings…")
    ]
  })
}
