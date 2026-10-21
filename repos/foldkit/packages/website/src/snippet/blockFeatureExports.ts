// page/settings/block.ts
const requestReset = Message.RequestedReset

export const SettingsBlock = SettingsComposition.assembleBlock({
  init,
  update,
  view,
  operations: { requestReset },
  EffectsLayer: SaveTheme.layer,
})

// page/settings/index.ts
export { SettingsBlock } from './block'

// Parent
import { SettingsBlock } from './page/settings'

SettingsBlock.Model
SettingsBlock.Message
SettingsBlock.OutMessage.match
ApplicationDefinition.bindChild(SettingsBlock, {
  field: 'settings',
  init: false,
  outMessage: { fold: foldSettingsOutMessage },
})
