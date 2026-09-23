import { Effect } from "effect";
import { Projection } from "../../journal/projection.ts";
import { ThreadParticipationFacts } from "./facts.ts";
import { ThreadParticipationStore } from "./store.ts";
export const definition = Projection.make("thread.participation", { version: 1 })
  .on(
    ThreadParticipationFacts.Ended,
    Effect.fn("ThreadParticipationProjection.ended")(function* ({ payload, provenance }) {
      const store = yield* ThreadParticipationStore.Service;
      if (store.workspaceId !== payload.workspaceId)
        return yield* new ThreadParticipationStore.Conflict({
          operation: "project",
          message: "Fact belongs to another workspace",
        });
      yield* store.end(payload, provenance.occurredAt);
    }),
  )
  .on(
    ThreadParticipationFacts.Added,
    Effect.fn("ThreadParticipationProjection.added")(function* ({
      payload: { groupId: _group, ...payload },
    }) {
      const store = yield* ThreadParticipationStore.Service;
      if (store.workspaceId !== payload.workspaceId)
        return yield* new ThreadParticipationStore.Conflict({
          operation: "project",
          message: "Fact belongs to another workspace",
        });
      yield* store.insert(payload);
    }),
  );
export * as ThreadParticipationProjection from "./projection.ts";
