import type { Block } from 'foldkit'

import { LoggedOutDefinition } from './definition'
import { OutMessage } from './message'
import { LoginBlock } from './page/login'

export const LoginBinding = LoggedOutDefinition.bindChild(LoginBlock, {
  field: 'loginModel',
  init: { contextToArgs: () => [] },
  outMessage: {
    forward: LoginBlock.OutMessage.match<OutMessage>({
      SucceededLogin: ({ session }) => OutMessage.SucceededLogin({ session }),
    }),
  },
})

export const LoggedOutComposition = LoggedOutDefinition.makeComposition({
  bindings: [LoginBinding],
})
export type LoggedOutViewBuilder = Block.ViewBuilderFor<
  typeof LoggedOutComposition
>
