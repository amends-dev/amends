import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { ProfileCardComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const ProfileCardBlockValue = ProfileCardComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  operations: { requestOpen: Message.RequestedOpen },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
})
type ProfileCardBlockType = typeof ProfileCardBlockValue
export interface ProfileCardBlock extends ProfileCardBlockType {}
export const ProfileCardBlock: ProfileCardBlock = ProfileCardBlockValue
