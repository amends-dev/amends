import { Match, Option } from 'effect'

import { ClearSession, RedirectToHome } from '../command'
import { ApplicationDefinition } from '../definition'
import { LoggedInBlock, LoggedOutBlock } from '../page'
import { ApplicationRoute } from '../route'

const foldLoggedInOutMessage = LoggedInBlock.OutMessage.match({
  RequestedLogout: () =>
    ApplicationDefinition.step(() => ({
      model: LoggedOutBlock.init(ApplicationRoute.Home()).model,
      commands: [ClearSession(), RedirectToHome()],
    })),
})

export const LoggedInBinding = ApplicationDefinition.bindChild(LoggedInBlock, {
  read: model =>
    Match.value(model).pipe(
      Match.tagsExhaustive({
        LoggedOut: () => Option.none(),
        LoggedIn: loggedInModel => Option.some(loggedInModel),
      }),
    ),
  write: (_model, nextLoggedIn) => nextLoggedIn,
  outMessage: { fold: foldLoggedInOutMessage },
})
