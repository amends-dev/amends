import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { ThreadsComposition } from "./composition.ts"
import { Message, OutMessage } from "./definition.ts"

export const update = ThreadsComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedThreads: ({ threads }) => ({ model: modifyFields(model, { threads: () => threads }) }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ChoseTab: ({ tab }) => ({ model: modifyFields(model, { tab: () => tab }) }),
    ChoseTaskStatus: ({ status }) => ({
      model: modifyFields(model, { taskFilter: (filter) => modifyFields(filter, { status: () => status }) })
    }),
    TypedTaskQuery: ({ query }) => ({
      model: modifyFields(model, { taskFilter: (filter) => modifyFields(filter, { query: () => query }) })
    }),
    ClickedThread: ({ threadId }) => ({ model, outMessage: OutMessage.SelectedThread({ threadId }) }),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
)
