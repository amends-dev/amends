import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { TasksComposition } from "./composition.ts"
import { Message, OutMessage } from "./definition.ts"

export const update = TasksComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedTasks: ({ items }) => ({ model: modifyFields(model, { items: () => items }) }),
    ReceivedPeople: ({ members, contacts }) => ({
      model: modifyFields(model, { members: () => members, contacts: () => contacts })
    }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ChoseStatus: ({ status }) => ({
      model: modifyFields(model, { filter: (filter) => modifyFields(filter, { status: () => status }) })
    }),
    ChoseAssignee: ({ assignee }) => ({
      model: modifyFields(model, { filter: (filter) => modifyFields(filter, { assignee: () => assignee }) })
    }),
    TypedQuery: ({ query }) => ({
      model: modifyFields(model, { filter: (filter) => modifyFields(filter, { query: () => query }) })
    }),
    ClickedTask: ({ groupId, threadId }) => ({ model, outMessage: OutMessage.OpenedThread({ groupId, threadId }) })
  })
)
