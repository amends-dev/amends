import { Schema } from 'effect'
import { Block } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

const Theme = Schema.Literals(['Light', 'Dark', 'System'])
type Theme = typeof Theme.Type

const ThemePickerModel = Schema.Struct({ theme: Theme })
const ThemePickerMessage = defineMessageUnion({
  ChangedTheme: { theme: Theme },
})
const ThemePickerComposition = Block.makeDefinition('ThemePicker', {
  Model: ThemePickerModel,
  Message: ThemePickerMessage,
}).makeComposition()

const themePickerInit = ThemePickerComposition.makeInit((theme: Theme) => ({
  model: ThemePickerModel.make({ theme }),
}))
const themePickerUpdate = ThemePickerComposition.makeUpdate((model, message) =>
  ThemePickerMessage.match(message, {
    ChangedTheme: ({ theme }) => ({
      model: modifyFields(model, { theme: () => theme }),
    }),
  }),
)
const themePickerView = ThemePickerComposition.makeView((model, h) =>
  h.p([], [`Theme: ${model.theme}`]),
)
const ThemePickerBlock = ThemePickerComposition.assembleBlock({
  init: themePickerInit,
  update: themePickerUpdate,
  view: themePickerView,
})

const ProfileModel = Schema.Struct({
  username: Schema.String,
  themePicker: ThemePickerModel,
})
const ProfileMessage = defineMessageUnion({})
const ProfileChildInitContext = Schema.Struct({
  username: Schema.String,
  savedTheme: Theme,
})
type ProfileChildInitContext = typeof ProfileChildInitContext.Type

const ProfileDefinition = Block.makeDefinition('Profile', {
  Model: ProfileModel,
  Message: ProfileMessage,
  ChildInitContext: ProfileChildInitContext,
})

const ThemePickerBinding = ProfileDefinition.bindChild(ThemePickerBlock, {
  field: 'themePicker',
  init: {
    contextToArgs: ({ savedTheme }) => [savedTheme],
  },
})

const ProfileComposition = ProfileDefinition.makeComposition({
  bindings: [ThemePickerBinding],
})

export const init = ProfileComposition.makeInit(
  (childInitContext: ProfileChildInitContext) => ({
    childInitContext,
    model: { username: childInitContext.username },
  }),
)
