/** Agent loading failures and their retry action. */

import { button } from "@amends-dev/design/control"
import { paneEmpty } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import type { AgentsViewBuilder } from "../composition.ts"
import { Message, type Model } from "../definition.ts"

/** Whether the agents could not be read, which is why there are none to show: nothing was read, and why. */
export const isUnread = (model: Model): boolean => !model.isLoaded && Option.isSome(model.notice)

/** What a page says in place of the agents when they could not be read: why, as the line under the title. */
export const unreadAgents = (model: Model, h: AgentsViewBuilder): Html =>
  paneEmpty(h, {
    art: "came-apart",
    title: "Couldn’t load agents",
    ...Option.match(model.notice, { onNone: () => ({}), onSome: (copy) => ({ copy }) }),
    action: button(h, "Retry", Message.ClickedRetry())
  })
