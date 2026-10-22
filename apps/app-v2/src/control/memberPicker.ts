/** The shared headless member combobox and its focus behavior. */

import { Multi, inputId } from "@foldkit/ui/combobox"
import * as Effect from "effect/Effect"
import * as Dom from "foldkit/dom"

/** The headless combobox every members picker binds, whose values are the IDs of members. */
export const MembersComboboxBlock = Multi.create()

/** Move focus to the input of the picker `id`, such as after the chip that held it was removed. */
export const focusMembersInput = (id: string) => Dom.focus(`#${CSS.escape(inputId(id))}`).pipe(Effect.ignore)
