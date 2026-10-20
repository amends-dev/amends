/**
 * Keys pressed while an input method composes text, such as the Enter that confirms a conversion, belong to it. They
 * neither send a message nor add a line, and the page's key handlers do not see them. Foldkit's key handlers are given
 * a key and its modifiers and not the event, so they cannot tell the two Enters apart.
 */

import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

/**
 * The keyCode a browser gives a key it has handed to an input method. Safari reports the Enter that confirms a
 * conversion with it after the composition has ended, when the event no longer says it is composing.
 */
const inputMethodKeyCode = 229

const isComposingKey = (event: Event): boolean =>
  event instanceof KeyboardEvent && (event.isComposing || event.keyCode === inputMethodKeyCode)

/**
 * Stop each key pressed while an input method composes text from reaching any handler of the page, until the scope
 * ends. The listener is on the document, in the capture phase, so it runs before a handler on the element.
 */
export const reserveKeysForInputMethod = Effect.acquireRelease(
  Effect.sync(() => {
    const reserve = (event: Event) => {
      if (isComposingKey(event)) {
        event.stopImmediatePropagation()
      }
    }
    document.addEventListener("keydown", reserve, { capture: true })
    return reserve
  }),
  (reserve) => Effect.sync(() => document.removeEventListener("keydown", reserve, { capture: true }))
).pipe(Effect.asVoid)

/** The page reserves the keys of an input method for as long as the app runs. */
export const layer = Layer.effectDiscard(reserveKeysForInputMethod)
