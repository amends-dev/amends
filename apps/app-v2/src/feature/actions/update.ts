import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { Dismiss, ExpireConfirmation } from "./command.ts"
import { ActionsComposition } from "./composition.ts"
import { Message, type Model, OutMessage } from "./definition.ts"

/** The model without the confirmation `id`, which the person acted on or whose time was up. */
const withoutConfirmation = (model: Model, id: number) =>
  modifyFields(model, {
    confirmations: (confirmations) => confirmations.filter((confirmation) => confirmation.id !== id)
  })

/** The confirmation `id`, while it is showing. */
const findConfirmation = (model: Model, id: number) =>
  Option.fromUndefinedOr(model.confirmations.find((confirmation) => confirmation.id === id))

export const update = ActionsComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedActions: ({ actions }) => ({ model: modifyFields(model, { actions: () => actions }) }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedDismiss: ({ key }) => ({
      model,
      commands: [Dismiss({ workspaceId: model.workspaceId, memberId: model.memberId, key })]
    }),
    CompletedDismiss: () => ({ model }),
    Confirmed: ({ text, offer }) => ({
      model: modifyFields(model, {
        confirmations: (confirmations) => [
          ...confirmations,
          { id: model.nextConfirmationId, text, offer: Option.fromUndefinedOr(offer) }
        ],
        nextConfirmationId: (nextConfirmationId) => nextConfirmationId + 1
      }),
      commands: [ExpireConfirmation({ id: model.nextConfirmationId })]
    }),
    ClickedOffer: ({ id }) =>
      Option.match(
        Option.flatMap(findConfirmation(model, id), ({ offer }) => offer),
        {
          onNone: () => ({ model }),
          onSome: (offer) => ({ model: withoutConfirmation(model, id), outMessage: OutMessage.TookOffer({ offer }) })
        }
      ),
    ExpiredConfirmation: ({ id }) => ({ model: withoutConfirmation(model, id) })
  })
)
