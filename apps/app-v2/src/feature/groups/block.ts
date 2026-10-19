import { GroupsComposition } from "./composition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

export const GroupsBlock = GroupsComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer: subscriptions.layer
})
