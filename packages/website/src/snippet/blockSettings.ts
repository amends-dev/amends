import { modifyFields } from 'foldkit/struct'

import {
  Message,
  Model,
  OutMessage,
  SaveTheme,
  SettingsDefinition,
  SettingsComposition,
  Theme,
} from './blockDefinition'

const changeTheme = SettingsDefinition.step((model, theme: Theme) => ({
  model: modifyFields(model, { theme: () => theme }),
  commands: [SaveTheme({ theme })],
  outMessage: OutMessage.ChangedTheme({ theme }),
}))

const update = SettingsComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ChangedTheme: ({ theme }) => changeTheme(model, theme),
    RequestedThemeChange: ({ theme }) => changeTheme(model, theme),
    RequestedReset: () => changeTheme(model, 'System'),
    CompletedSaveTheme: () => ({ model }),
    FailedSaveTheme: () => ({ model }),
  }),
)

const view = SettingsComposition.makeView((model, h) =>
  h.div(
    [],
    [
      h.p([], [`Theme: ${model.theme}`]),
      h.button(
        [h.OnClick(Message.ChangedTheme({ theme: 'Dark' }))],
        ['Use dark theme'],
      ),
    ],
  ),
)

const init = SettingsComposition.makeInit(() => ({
  model: Model.make({ theme: 'System' }),
}))

export const SettingsBlock = SettingsComposition.assembleBlock({
  init,
  update,
  view,
  operations: {
    requestReset: Message.RequestedReset,
  },
  EffectsLayer: SaveTheme.layer,
})
