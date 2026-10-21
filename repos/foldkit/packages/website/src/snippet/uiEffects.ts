// composition.ts
import { Dialog, Menu } from '@foldkit/ui'

import { ApplicationDefinition } from './definition'

export const DialogBinding = ApplicationDefinition.bindChild(
  Dialog.DialogBlock,
  {
    field: 'dialog',
    outMessage: { fold: foldDialogOutMessage },
  },
)

export const ApplicationMenu = Menu.create<string>()

export const MenuBinding = ApplicationDefinition.bindChild(ApplicationMenu, {
  field: 'menu',
  outMessage: { fold: foldMenuOutMessage },
})

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [DialogBinding, MenuBinding],
})

// update.ts
import { ApplicationComposition } from './composition'

export const update = ApplicationComposition.makeUpdate()

// view.ts
import {
  ApplicationComposition,
  DialogBinding,
  MenuBinding,
} from './composition'

export const view = ApplicationComposition.makeView((model, h) => ({
  title: 'Account',
  body: h.main(
    [],
    [
      h.block(
        DialogBinding.embedView({
          slotId: 'dialog',
          model: model.dialog,
          viewInputs: dialogViewInputs,
        }),
      ),
      h.block(
        MenuBinding.embedView({
          slotId: 'menu',
          model: model.menu,
          viewInputs: menuViewInputs,
        }),
      ),
    ],
  ),
}))

// entry.ts
import { Runtime } from 'foldkit'

import { ApplicationComposition } from './composition'
import { init } from './init'
import { update } from './update'
import { view } from './view'

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  container: document.getElementById('root'),
  devTools: { Message: ApplicationComposition.Message },
})

Runtime.run(application)
