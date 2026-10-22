/** Home selections that can be restored independently of loaded replica data. */

import * as Array from "effect/Array"
import * as Option from "effect/Option"
import { HomeDestination } from "../../../route.ts"
import { type Model, Open } from "./definition.ts"

export const destinationOf = (model: Model): HomeDestination =>
  Open.match(model.open, {
    Inbox: () =>
      HomeDestination.Inbox({
        tab: model.inbox.tab,
        selected: Option.map(model.inbox.selected, ({ notificationId, groupId, threadId }) => ({
          notificationId,
          groupId,
          threadId
        }))
      }),
    Triage: () => HomeDestination.Triage(),
    Tasks: () => HomeDestination.Tasks(),
    Groups: () => HomeDestination.Groups(),
    Group: ({ groupId, model }) =>
      HomeDestination.Group({ groupId, threadId: Option.map(model.thread, ({ threadId }) => threadId) }),
    Unsent: ({ model }) =>
      Array.isReadonlyArrayNonEmpty(model.memberIds)
        ? HomeDestination.Conversation({ memberIds: model.memberIds })
        : HomeDestination.Groups()
  })
