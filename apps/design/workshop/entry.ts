/**
 * Boot the workshop in the page's `#root`.
 */

import { Runtime } from "foldkit"
import { ApplicationComposition } from "./composition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { directoryTableFrame, directoryTableView, view } from "./view.ts"

const isDirectoryTableFrame = new URLSearchParams(window.location.search).get("frame") === directoryTableFrame

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view: isDirectoryTableFrame ? directoryTableView : view,
  container: document.getElementById("root"),
  devTools: isDirectoryTableFrame ? false : { Message: ApplicationComposition.Message }
})

Runtime.run(application)
