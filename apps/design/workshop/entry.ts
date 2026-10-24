/**
 * Boot the workshop in the page's `#root`.
 */

import { Block, Program, Runtime } from "foldkit"
import { ApplicationComposition } from "./composition.ts"
import type { Model } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import {
  directoryTableFrame,
  directoryTableView,
  listPaneFrame,
  listPaneView,
  phoneModalFrame,
  phoneModalView,
  phonePaletteFrame,
  phonePaletteView,
  view
} from "./view.ts"

const frame = new URLSearchParams(window.location.search).get("frame")

const framedViews = new Map([
  [directoryTableFrame, directoryTableView],
  [listPaneFrame, listPaneView],
  [phoneModalFrame, phoneModalView],
  [phonePaletteFrame, phonePaletteView]
])

const framedView = frame === null ? undefined : framedViews.get(frame)

const prepare = () => ApplicationComposition.prepareBlock({ init, update, view: framedView ?? view })
const ApplicationBlock: Block.FromAssemblyWithView<typeof Model, typeof prepare> = Block.assemble(prepare)

const program = Program.make({
  block: ApplicationBlock,
  container: document.getElementById("root"),
  devTools: framedView === undefined ? { dispatch: true } : false
})

Runtime.run(program)
