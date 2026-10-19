/**
 * Boot the app in the page's `#root`, from the session kept from the last visit.
 */

import { Runtime } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { ApplicationComposition } from "./composition.ts"
import { Flags, flags } from "./flags.ts"
import { init } from "./init.ts"
import { ApplicationLayer } from "./services.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  EffectsLayer,
  Flags,
  container: document.getElementById("root"),
  devTools: { Message: ApplicationComposition.Message }
})

Runtime.run(application.provide(ApplicationLayer), { flags })
