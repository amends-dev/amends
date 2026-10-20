/**
 * What the dialogs that change a name share: the field selects its text when it takes focus.
 */

import * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"

/**
 * Select the text of `element`, when it is a field, now if it has the focus and each time it takes focus, so that typing
 * replaces it, until the scope it is acquired in ends. A dialog may focus its field before the field is mounted.
 */
export const selectTextOnFocus = (element: Element): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const selectText = () => {
        if (element instanceof HTMLInputElement) element.select()
      }
      element.addEventListener("focus", selectText)
      if (element.ownerDocument.activeElement === element) selectText()
      return selectText
    }),
    (selectText) => Effect.sync(() => element.removeEventListener("focus", selectText))
  ).pipe(Effect.asVoid)
