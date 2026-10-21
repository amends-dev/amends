import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { CreateTask } from "./command.ts"
import { TaskComposition } from "./composition.ts"
import { Message } from "./definition.ts"

export const update = TaskComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedTask: ({ groupId, task }) => ({ model: modifyFields(model, { groupId: () => groupId, task: () => task }) }),
    ReceivedMembers: ({ members }) => ({ model: modifyFields(model, { members: () => members }) }),
    ReceivedGrants: ({ grants }) => ({ model: modifyFields(model, { grants: () => grants }) }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedMakeTask: () => ({
      model,
      commands: [CreateTask({ workspaceId: model.workspaceId, memberId: model.memberId, threadId: model.threadId })]
    }),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
)
