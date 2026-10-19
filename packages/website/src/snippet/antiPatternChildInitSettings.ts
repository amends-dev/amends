// settings.ts

import { SettingsDefinition } from './definition'

export const Theme = Schema.Literals(['Light', 'Dark'])
export type Theme = typeof Theme.Type

export const Message = defineMessageUnion({
  RequestedRestore: { theme: Theme },
  CompletedRefreshAvailableThemes: {},
})

export const OutMessage = defineMessageUnion({
  RestoredTheme: { theme: Theme },
})

const SettingsComposition = SettingsDefinition.makeComposition()
const requestRestore = Message.RequestedRestore

export const init = SettingsComposition.makeInit(() => ({
  model: Model.make({ theme: 'Light' }),
}))

export const update = SettingsComposition.makeUpdate((model, message) =>
  Message.match(message, {
    RequestedRestore: ({ theme }) => ({
      model: modifyFields(model, { theme: () => theme }),
      commands: [RefreshAvailableThemes()],
      outMessage: OutMessage.RestoredTheme({ theme }),
    }),
    CompletedRefreshAvailableThemes: () => ({ model }),
  }),
)

export const block = SettingsComposition.assembleBlock({
  init,
  update,
  operations: { requestRestore },
  EffectsLayer,
})
