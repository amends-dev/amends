import { Effect } from "effect";
import { Projection } from "../../journal/projection.ts";
import { ThreadMessageFacts } from "./facts.ts";
import { ThreadMessageStore } from "./store.ts";

export const definition = Projection.make("thread.message", { version: 1 }).on(
  ThreadMessageFacts.Published,
  Effect.fn("ThreadMessageProjection.published")(function* ({
    payload: { groupId: _group, ...payload },
  }) {
    const store = yield* ThreadMessageStore.Service;
    yield* store.insert(payload);
  }),
);
export * as ThreadMessageProjection from "./projection.ts";
