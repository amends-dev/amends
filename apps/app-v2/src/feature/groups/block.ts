import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { GroupsComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  operations: {
    informOpenGroup: Message.InformedOfOpenGroup,
    requestConversationWith: Message.RequestedConversationWith
  },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
}

const GroupsBlockValue = GroupsComposition.assembleBlock<typeof implementation>(implementation)
type GroupsBlockType = typeof GroupsBlockValue
export interface GroupsBlock extends GroupsBlockType {}
export const GroupsBlock: GroupsBlock = GroupsBlockValue
