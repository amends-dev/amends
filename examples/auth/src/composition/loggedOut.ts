import { Match, Option } from 'effect'

import { RedirectToDashboard, SaveSession } from '../command'
import { ApplicationDefinition } from '../definition'
import { LoggedInBlock, LoggedOutBlock } from '../page'
import { ApplicationRoute } from '../route'

const foldLoggedOutOutMessage = LoggedOutBlock.OutMessage.match({
  SucceededLogin: ({ session }) =>
    ApplicationDefinition.step(() => ({
      model: LoggedInBlock.init(ApplicationRoute.Dashboard(), session).model,
      commands: [SaveSession({ session }), RedirectToDashboard()],
    })),
})

export const LoggedOutBinding = ApplicationDefinition.bindChild(
  LoggedOutBlock,
  {
    read: model =>
      Match.value(model).pipe(
        Match.tagsExhaustive({
          LoggedOut: loggedOutModel => Option.some(loggedOutModel),
          LoggedIn: () => Option.none(),
        }),
      ),
    write: (_model, nextLoggedOut) => nextLoggedOut,
    outMessage: { fold: foldLoggedOutOutMessage },
  },
)
