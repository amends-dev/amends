import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { Dismiss, ExpireConfirmation } from "./command.ts"
import { ActionsComposition } from "./composition.ts"
import { Message, type Model } from "./definition.ts"

/** The model without the confirmation `id`, which the person dismissed or whose time was up. */
const withoutConfirmation = (model: Model, id: number) =>
  modifyFields(model, {
    confirmations: (confirmations) => confirmations.filter((confirmation) => confirmation.id !== id)
  })

export const update = ActionsComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedActions: ({ actions }) => ({ model: modifyFields(model, { actions: () => actions }) }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedDismiss: ({ key }) => ({
      model,
      commands: [Dismiss({ workspaceId: model.workspaceId, memberId: model.memberId, key })]
    }),
    CompletedDismiss: () => ({ model }),
    Confirmed: ({ text }) => ({
      model: modifyFields(model, {
        confirmations: (confirmations) => [...confirmations, { id: model.nextConfirmationId, text }],
        nextConfirmationId: (nextConfirmationId) => nextConfirmationId + 1
      }),
      commands: [ExpireConfirmation({ id: model.nextConfirmationId })]
    }),
    ClickedDismissConfirmation: ({ id }) => ({ model: withoutConfirmation(model, id) }),
    ExpiredConfirmation: ({ id }) => ({ model: withoutConfirmation(model, id) })
  })
)
