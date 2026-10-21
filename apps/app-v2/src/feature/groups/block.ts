import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { GroupsComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const GroupsBlockValue = GroupsComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  operations: {
    informOpenGroup: Message.InformedOfOpenGroup,
    requestConversationWith: Message.RequestedConversationWith
  },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
})
type GroupsBlockType = typeof GroupsBlockValue
export interface GroupsBlock extends GroupsBlockType {}
export const GroupsBlock: GroupsBlock = GroupsBlockValue
