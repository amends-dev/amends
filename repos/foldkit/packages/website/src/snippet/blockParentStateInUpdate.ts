import { Array, Schema } from 'effect'
import { Block } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

const CurrentUser = Schema.Struct({ name: Schema.String })
type CurrentUser = typeof CurrentUser.Type
const Theme = Schema.Literals(['Light', 'Dark'])

const AccountSettingsModel = Schema.Struct({
  theme: Theme,
  auditTrail: Schema.Array(Schema.String),
})
const AccountSettingsMessage = defineMessageUnion({
  ChangedTheme: { theme: Theme },
})
const AccountSettingsComposition = Block.makeDefinition('AccountSettings', {
  Model: AccountSettingsModel,
  Message: AccountSettingsMessage,
}).makeComposition()

const accountSettingsInit = AccountSettingsComposition.makeInit(() => ({
  model: AccountSettingsModel.make({
    theme: 'Light',
    auditTrail: [],
  }),
}))
const accountSettingsUpdate = AccountSettingsComposition.makeUpdate(
  (model, message, currentUser: CurrentUser) =>
    AccountSettingsMessage.match(message, {
      ChangedTheme: ({ theme }) => ({
        model: modifyFields(model, {
          theme: () => theme,
          auditTrail: Array.append(currentUser.name),
        }),
      }),
    }),
)
const accountSettingsView = AccountSettingsComposition.makeView((model, h) =>
  h.p([], [`${model.theme}; audit: ${Array.join(model.auditTrail, ', ')}`]),
)
const AccountSettingsBlock = AccountSettingsComposition.assembleBlock({
  init: accountSettingsInit,
  update: accountSettingsUpdate,
  view: accountSettingsView,
})

const ProfileModel = Schema.Struct({
  currentUser: CurrentUser,
  accountSettings: AccountSettingsModel,
})
const ProfileMessage = defineMessageUnion({})
const ProfileDefinition = Block.makeDefinition('Profile', {
  Model: ProfileModel,
  Message: ProfileMessage,
})

export const AccountSettingsBinding = ProfileDefinition.bindChild(
  AccountSettingsBlock,
  {
    field: 'accountSettings',
    delivery: {
      toUpdateContext: model => [model.currentUser],
    },
  },
)

export const ProfileComposition = ProfileDefinition.makeComposition({
  bindings: [AccountSettingsBinding],
})
