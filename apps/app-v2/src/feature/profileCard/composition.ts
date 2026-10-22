import { AnchorProfileCard } from "./command.ts"
import { ProfileCardDefinition } from "./definition.ts"

export const ProfileCardComposition = ProfileCardDefinition.makeComposition({ mounts: [AnchorProfileCard] })
