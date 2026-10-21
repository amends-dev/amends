// ❌ Bad
// The authored update receives a wrapper that belongs to the child Binding.
const BadDialogBinding = ApplicationDefinition.bindChild(Dialog.block, {
  field: 'dialog',
  toParentMessage: message => Message.GotDialogMessage({ message }),
  fromParentMessage: false,
})

const badUpdate = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    GotDialogMessage: ({ message }) => BadDialogBinding.fold(model, message),
    ClickedSave: () => ({ model }),
  }),
)

// ✅ Good
// Composition derives delivery from the registered Binding.
const DialogBinding = ApplicationDefinition.bindChild(Dialog.DialogBlock, {
  field: 'dialog',
})

const update = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedSave: () => ({ model }),
  }),
)
