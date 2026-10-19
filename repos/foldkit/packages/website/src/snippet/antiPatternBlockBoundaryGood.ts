// ✅ Good: the child declares an operation that runs its update.

const SettingsComposition = SettingsDefinition.makeComposition()
const requestThemeChange = Message.RequestedThemeChange

export const block = SettingsComposition.assembleBlock({
  init,
  update,
  operations: { requestThemeChange },
  EffectsLayer,
})

const update = ParentComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedResetSettings: () =>
      SettingsBinding.requestThemeChange({ theme: 'Light' })(model),
  }),
)
