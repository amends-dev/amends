/** Connection failures and their retry or refresh actions. */

import { button, buttonRow, column, notice } from "@amends-dev/design/control"
import { paneEmpty } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import type { ConnectionsViewBuilder } from "../composition.ts"
import { type Failure, Message, type Model } from "../definition.ts"
import { connectionsMessage, needsRefresh } from "./wording.ts"

/**
 * What went wrong with a change or a check, for the place it was made, with a way to refresh when what the person sees
 * is out of date.
 */
export const failureView = (failure: Option.Option<Failure>, h: ConnectionsViewBuilder): Html =>
  Option.match(failure, {
    onNone: () => h.empty,
    onSome: (failed) =>
      needsRefresh(failed.reason)
        ? column(h, [
            notice(h, Option.some(connectionsMessage(failed))),
            buttonRow(h, [button(h, "Refresh", Message.ClickedRefresh(), { variant: "quiet" })])
          ])
        : notice(h, Option.some(connectionsMessage(failed)))
  })

/** Whether the connections could not be read, which is why there are none to show: nothing was read, and why. */
export const isUnread = (model: Model): boolean => !model.isLoaded && Option.isSome(model.notice)

/** What a page says in place of the connections when they could not be read: why, as the line under the title. */
export const unreadConnections = (model: Model, h: ConnectionsViewBuilder): Html =>
  paneEmpty(h, {
    art: "came-apart",
    title: "Couldn’t load connections",
    ...Option.match(model.notice, { onNone: () => ({}), onSome: (copy) => ({ copy }) }),
    action: button(h, "Retry", Message.ClickedRetry())
  })
