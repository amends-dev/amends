/**
 * Boot the app in the page's `#root`, from the session kept from the last visit and the window's width.
 */

import * as Layer from "effect/Layer"
import { Runtime } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { ApplicationComposition } from "./composition.ts"
import { crashView } from "./crash.ts"
import { Flags, flags } from "./flags.ts"
import { init } from "./init.ts"
import { ApplicationLayer } from "./services.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer: Layer.mergeAll(EffectsLayer, subscriptions.layer),
  Flags,
  container: document.getElementById("root"),
  crash: { view: crashView },
  devTools: { Message: ApplicationComposition.Message }
})

Runtime.run(application.provide(ApplicationLayer), { flags })
