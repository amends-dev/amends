import { anchorSetup } from "@foldkit/ui/anchor"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Dom from "foldkit/dom"
import { Message, ProfileCardDefinition } from "./definition.ts"

/** The card sits this far from its trigger, and this far inside the window's edges. */
const gap = 8
const inset = 16

/** Move focus to the trigger `triggerId`, which a card that closes gives it back to. */
export const FocusTrigger = ProfileCardDefinition.command("FocusTrigger", {
  args: { triggerId: Schema.String },
  messages: [Message.CompletedFocusTrigger],
  handler: function* () {
    return ({ triggerId }) =>
      Dom.focus(`#${CSS.escape(triggerId)}`).pipe(Effect.ignore, Effect.as(Message.CompletedFocusTrigger()))
  }
})

/**
 * Place the card it is mounted on under the trigger `triggerId`, or above it where there is no room below, and keep
 * it there while the page scrolls and resizes, then move focus into it, until the card goes.
 */
export const AnchorProfileCard = ProfileCardDefinition.mount("AnchorProfileCard", {
  args: { triggerId: Schema.String },
  messages: [Message.CompletedAnchorProfileCard],
  handler: function* () {
    return ({ element, triggerId }) =>
      Effect.acquireRelease(
        Effect.sync(() =>
          anchorSetup(element, {
            buttonId: triggerId,
            anchor: { placement: "bottom-start", gap, padding: inset },
            interceptTab: false,
            focusAfterPosition: true
          })
        ),
        (cleanup) => Effect.sync(cleanup)
      ).pipe(Effect.as(Message.CompletedAnchorProfileCard()))
  }
})

export const EffectsLayer = Layer.mergeAll(FocusTrigger.layer, AnchorProfileCard.layer)
