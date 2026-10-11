import { Effect } from "effect";
import * as Projection from "../../journal/projection.ts";
import * as MemberFacts from "./facts.ts";
import * as MemberStore from "./store.ts";

/** Projects recorded membership changes into the host's transactional read model. */
export const definition = Projection.make("workspace.members", { version: 1 })
  .on(
    MemberFacts.Added,
    Effect.fn("MemberProjection.added")(function* ({ payload }) {
      const memberStore = yield* MemberStore.MemberStore;
      yield* memberStore.insert({
        id: payload.memberId,
        workspaceId: payload.workspaceId,
        identity: payload.identity,
        name: payload.name,
        status: "active",
      });
    }),
  )
  .on(
    MemberFacts.Renamed,
    Effect.fn("MemberProjection.renamed")(function* ({ payload }) {
      const memberStore = yield* MemberStore.MemberStore;
      yield* memberStore.rename(payload.memberId, payload.name);
    }),
  )
  .on(
    MemberFacts.Removed,
    Effect.fn("MemberProjection.removed")(function* ({ payload }) {
      const memberStore = yield* MemberStore.MemberStore;
      yield* memberStore.markRemoved(payload.memberId);
    }),
  );
