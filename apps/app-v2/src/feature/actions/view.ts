import * as Option from "effect/Option"
import { button, errorView } from "../../controls.ts"
import { ActionsComposition } from "./composition.ts"
import { Message } from "./definition.ts"

/** The actions the server refused, each with why, and a notice, when reading them failed. */
export const view = ActionsComposition.makeView((model, h) => {
  const refused = model.actions.flatMap((action) =>
    Option.match(action.rejection, { onNone: () => [], onSome: (why) => [{ ...action, why }] })
  )
  return h.div(
    [h.AriaLive("polite")],
    [
      errorView(model.notice, h),
      ...refused.map(({ key, what, text, why }) =>
        h.keyed("div")(
          key,
          [h.Role("alert")],
          [
            h.p([], [`Couldn't ${what}: ${why}`]),
            Option.match(text, { onNone: () => h.empty, onSome: (text) => h.blockquote([], [text]) }),
            button(h, "Dismiss", Message.ClickedDismiss({ key }))
          ]
        )
      )
    ]
  )
})
