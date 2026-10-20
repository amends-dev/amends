import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { GroupComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const GroupBlockValue = GroupComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  operations: { requestCloseThread: Message.RequestedCloseThread },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
})
type GroupBlockType = typeof GroupBlockValue
export interface GroupBlock extends GroupBlockType {}
export const GroupBlock: GroupBlock = GroupBlockValue
