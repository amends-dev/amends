import { Effect } from "effect";
import { Projection } from "../../journal/projection.ts";
import { GroupMembershipFacts } from "./facts.ts";
import { GroupMembershipStore } from "./store.ts";

export const definition = Projection.make("group.memberships", { version: 1 })
  .on(
    GroupMembershipFacts.Added,
    Effect.fn("GroupMembershipProjection.added")(function* ({ payload }) {
      const store = yield* GroupMembershipStore.Service;
      yield* store.insert(payload);
    }),
  )
  .on(
    GroupMembershipFacts.Removed,
    Effect.fn("GroupMembershipProjection.removed")(function* ({ payload }) {
      const store = yield* GroupMembershipStore.Service;
      yield* store.markRemoved(payload);
    }),
  );

export * as GroupMembershipProjection from "./projection.ts";
