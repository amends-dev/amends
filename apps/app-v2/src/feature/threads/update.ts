import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { FocusComposer, ScrollThreadsToEnd } from "./command.ts"
import { ThreadsComposition } from "./composition.ts"
import { Message, OutMessage } from "./definition.ts"

export const update = ThreadsComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedThreads: ({ threads }) => {
      // They open at their end, and stay there while the person is near it as one is added.
      const opens = !model.isLoaded && threads.length > 0
      const grew = threads.length > model.threads.length

      return {
        model: modifyFields(model, { threads: () => threads, isLoaded: () => true }),
        commands:
          model.tab === "Threads" && (opens || grew)
            ? [ScrollThreadsToEnd({ groupId: model.groupId, onlyIfNearEnd: !opens })]
            : []
      }
    },
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedTryAgain: () => ({
      model: modifyFields(model, { notice: () => Option.none(), reads: (reads) => reads + 1 })
    }),
    ChoseTab: ({ tab }) => ({
      model: modifyFields(model, { tab: () => tab }),
      commands:
        tab === "Threads" && model.tab !== "Threads"
          ? [ScrollThreadsToEnd({ groupId: model.groupId, onlyIfNearEnd: false })]
          : []
    }),
    CompletedScrollThreadsToEnd: () => ({ model }),
    TypedTaskQuery: ({ query }) => ({
      model: modifyFields(model, { taskFilter: (filter) => modifyFields(filter, { query: () => query }) })
    }),
    ClickedNewTask: () => ({ model, commands: [FocusComposer({ groupId: model.groupId })] }),
    CompletedFocusComposer: () => ({ model }),
    ClickedThread: ({ threadId }) => ({ model, outMessage: OutMessage.SelectedThread({ threadId }) }),
    OpenedProfile: ({ memberId, triggerId }) => ({
      model,
      outMessage: OutMessage.OpenedProfile({ memberId, triggerId })
    }),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
)
