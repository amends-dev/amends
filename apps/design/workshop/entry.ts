/**
 * Boot the workshop in the page's `#root`.
 */

import { Runtime } from "foldkit"
import { ApplicationComposition } from "./composition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  container: document.getElementById("root"),
  devTools: { Message: ApplicationComposition.Message }
})

Runtime.run(application)
