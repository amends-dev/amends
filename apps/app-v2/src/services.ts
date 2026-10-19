/**
 * What the app's handlers run over: the stores of the workspaces the person opens, their session,
 * and the browser's services beneath both.
 */

import * as Layer from "effect/Layer"
import * as Browser from "./browser.ts"
import { apiUrl } from "./flags.ts"
import * as Session from "./session.ts"
import * as Stores from "./store/Stores.ts"

export const ApplicationLayer = Stores.layer.pipe(
  Layer.provideMerge(Session.layer(apiUrl)),
  Layer.provideMerge(Browser.layer)
)
