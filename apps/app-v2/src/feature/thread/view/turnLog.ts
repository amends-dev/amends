/** The turn log displayed in place of its thread. */

import { logPaneView } from "../../turns/view.ts"
import { ThreadBlock } from "../block.ts"
import { TurnsBinding } from "../composition.ts"

/** Where the turn log is, such as "Thread in #general", which its summary says first. */
export type TurnLogInputs = Readonly<{ where: string }>

/** The log of the turn the person follows, which the turns Block draws as the side pane, in place of the thread. */
export const turnLogView = ThreadBlock.makeView.withInputs<TurnLogInputs>((model, { where }, h) =>
  h.block(TurnsBinding.embedView({ slotId: "turn-log", model: model.turns, view: logPaneView, viewInputs: { where } }))
)
