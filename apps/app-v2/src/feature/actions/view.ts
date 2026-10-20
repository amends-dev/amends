import { notice } from "@amends-dev/design/control"
import { confirmation, confirmationStack, toast, toastStack } from "@amends-dev/design/toast"
import * as Option from "effect/Option"
import { ActionsComposition } from "./composition.ts"
import { Message, Offer } from "./definition.ts"

/** What the button after a confirmation's words says, by what it offers. */
const offerLabel = Offer.match({ OpenGroup: () => "Open" })

/**
 * The actions the server refused as toasts, each with why and a way to dismiss it, in one stack with a notice, when
 * reading the actions failed, and beside it what the page confirmed to the person that they did, as confirmations,
 * which go by themselves and have no Dismiss, each with the one thing it offers to do next, if it offers one.
 */
export const view = ActionsComposition.makeView((model, h) => {
  const refused = model.actions.flatMap((action) =>
    Option.match(action.rejection, { onNone: () => [], onSome: (why) => [{ ...action, why }] })
  )

  return h.div(
    [],
    [
      toastStack(h, [
        notice(h, model.notice),
        ...refused.map(({ key, what, text, why }) =>
          h.keyed("div")(
            key,
            [],
            [
              toast(h, {
                text: `Couldn't ${what}: ${why}`,
                ...Option.match(text, { onNone: () => ({}), onSome: (detail) => ({ detail }) }),
                action: { label: "Dismiss", onClick: Message.ClickedDismiss({ key }) }
              })
            ]
          )
        )
      ]),
      confirmationStack(
        h,
        model.confirmations.map(({ id, text, offer }) =>
          confirmation(h, {
            key: `confirmation-${id}`,
            text,
            ...Option.match(offer, {
              onNone: () => ({}),
              onSome: (offered) => ({
                action: { label: offerLabel(offered), onClick: Message.ClickedOffer({ id }) }
              })
            })
          })
        )
      )
    ]
  )
})
