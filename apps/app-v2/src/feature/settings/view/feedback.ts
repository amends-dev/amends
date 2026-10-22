/** Settings failures and their refresh action. */

import { button, buttonRow, column, notice } from "@amends-dev/design/control"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import type { SettingsViewBuilder } from "../composition.ts"
import { type Failure, Message } from "../definition.ts"
import { needsRefresh, settingsMessage } from "./wording.ts"

/**
 * What went wrong with an action or a read, for the place it was made, with a way to refresh when what the person
 * sees is out of date.
 */
export const failureView = (failure: Option.Option<Failure>, h: SettingsViewBuilder): Html =>
  Option.match(failure, {
    onNone: () => h.empty,
    onSome: (failed) =>
      needsRefresh(failed.reason)
        ? column(h, [
            notice(h, Option.some(settingsMessage(failed))),
            buttonRow(h, [button(h, "Refresh", Message.ClickedRefresh(), { variant: "quiet" })])
          ])
        : notice(h, Option.some(settingsMessage(failed)))
  })
