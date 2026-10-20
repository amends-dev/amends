/**
 * Boot the workshop in the page's `#root`.
 */

import { Runtime } from "foldkit"
import { ApplicationComposition } from "./composition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { directoryTableFrame, directoryTableView, paneToolbarFrame, paneToolbarView, view } from "./view.ts"

const frame = new URLSearchParams(window.location.search).get("frame")

const framedViews = new Map([
  [directoryTableFrame, directoryTableView],
  [paneToolbarFrame, paneToolbarView]
])

const framedView = frame === null ? undefined : framedViews.get(frame)

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view: framedView ?? view,
  container: document.getElementById("root"),
  devTools: framedView === undefined ? { Message: ApplicationComposition.Message } : false
})

Runtime.run(application)
