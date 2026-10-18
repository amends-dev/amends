/**
 * Boot the app in the page's `#root`, from the session kept from the last visit.
 */

import type * as Layer from "effect/Layer"
import { Runtime } from "foldkit"
import type * as ManagedResource from "foldkit/managedResource"
import * as Browser from "./browser.ts"
import { Flags, flags } from "./flags.ts"
import { Message } from "./message.ts"
import { Model } from "./model.ts"
import { managedResources, type StoreResource, subscriptions } from "./store.ts"
import { init, update } from "./update.ts"
import { view } from "./view.ts"

const application = Runtime.makeApplication<
  Model,
  Message,
  Flags,
  Layer.Success<typeof Browser.layer>,
  ManagedResource.ServiceOf<typeof StoreResource>
>({
  Model,
  Flags,
  init,
  update,
  view,
  subscriptions,
  managedResources,
  resources: Browser.layer,
  container: document.getElementById("root"),
  devTools: { Message }
})

Runtime.run(application, { flags })
