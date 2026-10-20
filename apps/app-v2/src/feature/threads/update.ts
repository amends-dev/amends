import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { FocusComposer } from "./command.ts"
import { ThreadsComposition } from "./composition.ts"
import { Message, OutMessage } from "./definition.ts"

export const update = ThreadsComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedThreads: ({ threads }) => ({
      model: modifyFields(model, { threads: () => threads, isLoaded: () => true })
    }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ChoseTab: ({ tab }) => ({ model: modifyFields(model, { tab: () => tab }) }),
    ChoseTaskStatus: ({ status }) => ({
      model: modifyFields(model, { taskFilter: (filter) => modifyFields(filter, { status: () => status }) })
    }),
    TypedTaskQuery: ({ query }) => ({
      model: modifyFields(model, { taskFilter: (filter) => modifyFields(filter, { query: () => query }) })
    }),
    ClickedNewTask: () => ({ model, commands: [FocusComposer({ groupId: model.groupId })] }),
    CompletedFocusComposer: () => ({ model }),
    ClickedThread: ({ threadId }) => ({ model, outMessage: OutMessage.SelectedThread({ threadId }) }),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
)
