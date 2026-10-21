import { Block } from 'foldkit'
import type * as Update from 'foldkit/update'

import { Message } from './message'
import { Model } from './model'
import * as ThemeMenu from './themeMenu'

const foldThemeMenuOutMessage = ThemeMenu.ThemeMenuBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  Selected: () => SettingsDefinition.stepNoop(),
  Closed: () => SettingsDefinition.stepNoop(),
})

export const SettingsDefinition = Block.makeDefinition('Settings', {
  Model,
  Message,
})

const ThemeMenuBinding = SettingsDefinition.bindChild(
  ThemeMenu.ThemeMenuBlock,
  {
    field: 'themeMenu',
    outMessage: { fold: foldThemeMenuOutMessage },
  },
)

export const SettingsComposition = SettingsDefinition.makeComposition({
  bindings: [ThemeMenuBinding],
})
