import { Effect } from "effect";
import { Projection } from "../../journal/projection.ts";
import { MemberFacts } from "./facts.ts";
import { MemberStore } from "./store.ts";

/** Projects recorded membership changes into the host's transactional read model. */
export const definition = Projection.make("workspace.members", { version: 1 })
  .on(
    MemberFacts.Added,
    Effect.fn("MemberProjection.added")(function* ({ payload }) {
      const store = yield* MemberStore.Service;
      yield* store.insert({
        id: payload.memberId,
        workspaceId: payload.workspaceId,
        identity: payload.identity,
        ...(payload.name === undefined ? {} : { name: payload.name }),
        status: "active",
      });
    }),
  )
  .on(
    MemberFacts.Renamed,
    Effect.fn("MemberProjection.renamed")(function* ({ payload }) {
      const store = yield* MemberStore.Service;
      yield* store.rename(payload.memberId, payload.name);
    }),
  )
  .on(
    MemberFacts.Removed,
    Effect.fn("MemberProjection.removed")(function* ({ payload }) {
      const store = yield* MemberStore.Service;
      yield* store.markRemoved(payload.memberId);
    }),
  );

export * as MemberProjection from "./projection.ts";
