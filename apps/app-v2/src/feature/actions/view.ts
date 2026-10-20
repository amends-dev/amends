import { notice } from "@amends-dev/design/control"
import { toast, toastStack } from "@amends-dev/design/toast"
import * as Option from "effect/Option"
import { ActionsComposition } from "./composition.ts"
import { Message } from "./definition.ts"

/**
 * The actions the server refused as toasts, each with why and a way to dismiss it, and what the person did that the
 * page confirms as status toasts that go by themselves, in one stack, with a notice, when reading the actions failed.
 */
export const view = ActionsComposition.makeView((model, h) => {
  const refused = model.actions.flatMap((action) =>
    Option.match(action.rejection, { onNone: () => [], onSome: (why) => [{ ...action, why }] })
  )
  return toastStack(h, [
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
    ),
    ...model.confirmations.map(({ id, text }) =>
      h.keyed("div")(
        `confirmation-${id}`,
        [],
        [
          toast(h, {
            text,
            role: "status",
            action: { label: "Dismiss", onClick: Message.ClickedDismissConfirmation({ id }) }
          })
        ]
      )
    )
  ])
})
