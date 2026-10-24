import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { ProfileCardComposition } from "./composition.ts"
import { Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  operations: { requestOpen: Message.RequestedOpen, requestDismiss: Message.LeftCard },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
}

const prepare = () => ProfileCardComposition.prepareBlock(implementation)
const ProfileCardBlockValue: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type ProfileCardBlockType = typeof ProfileCardBlockValue
export interface ProfileCardBlock extends ProfileCardBlockType {}
export const ProfileCardBlock: ProfileCardBlock = ProfileCardBlockValue
