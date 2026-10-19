import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { Dismiss } from "./command.ts"
import { ActionsComposition } from "./composition.ts"
import { Message } from "./definition.ts"

export const update = ActionsComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedActions: ({ actions }) => ({ model: modifyFields(model, { actions: () => actions }) }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedDismiss: ({ key }) => ({
      model,
      commands: [Dismiss({ workspaceId: model.workspaceId, memberId: model.memberId, key })]
    }),
    CompletedDismiss: () => ({ model })
  })
)
