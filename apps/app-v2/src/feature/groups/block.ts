import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { GroupsComposition } from "./composition.ts"
import { Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  operations: {
    requestDismiss: Message.RequestedDismiss,
    requestBrowseTab: Message.ChoseBrowseTab,
    informOpenGroup: Message.InformedOfOpenGroup,
    requestConversationWith: Message.RequestedConversationWith
  },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
}

const prepare = () => GroupsComposition.prepareBlock(implementation)
const GroupsBlockValue: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type GroupsBlockType = typeof GroupsBlockValue
export interface GroupsBlock extends GroupsBlockType {}
export const GroupsBlock: GroupsBlock = GroupsBlockValue
