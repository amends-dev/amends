import { Option } from 'effect'
import { makeApplicationDefinition } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

import { foreignComposition, foreignDefinition } from 'third-party'

const Message = defineMessageUnion({
  ClickedSave: {},
})
const ApplicationDefinition = makeApplicationDefinition({ Model, Message })

defineMessageUnion({ ChangedSettings: {} })

ApplicationDefinition.bindChild(SilentBlock, { field: 'silent' })

ApplicationDefinition.bindChild(DialogBlock, {
  field: 'dialog',
})

ApplicationDefinition.bindChild(PickerBlock, {
  field: 'picker',
  delivery: {
    when: model => Option.isSome(model.maybePicker),
  },
})

const sharedMapping = {
  field: 'shared',
}

ApplicationDefinition.bindChild(SharedBlock, { ...sharedMapping })

const ApplicationComposition = ApplicationDefinition.makeComposition()

ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedSave: () => ({ model }),
  }),
)

ApplicationComposition.makeUpdate((model, message) =>
  message._tag === 'ClickedSave' ? { model } : { model },
)

ApplicationComposition.makeUpdate((model, message) => {
  const inspectLocalMessage = (message: { _tag: string }) =>
    message._tag === 'GotLocalMessage'
  inspectLocalMessage({ _tag: message._tag })

  return { model }
})

DialogBinding.fold(model, message)

foreignComposition.makeUpdate((model, message) =>
  ParentMessage.match(message, {
    GotForeignMessage: () => ({ model }),
  }),
)

const localForeignComposition = foreignDefinition.makeComposition()
localForeignComposition.makeUpdate((model, message) =>
  ParentMessage.match(message, {
    GotForeignMessage: () => ({ model }),
  }),
)
