import { Effect } from "effect";
import { Projection } from "../../journal/projection.ts";
import { GroupMembershipFacts } from "./facts.ts";
import { GroupMembershipStore } from "./store.ts";

export const definition = Projection.make("group.memberships", { version: 1 })
  .on(
    GroupMembershipFacts.Added,
    Effect.fn("GroupMembershipProjection.added")(function* ({ payload }) {
      const groupMembershipStore = yield* GroupMembershipStore.Service;
      yield* groupMembershipStore.insert(payload);
    }),
  )
  .on(
    GroupMembershipFacts.Removed,
    Effect.fn("GroupMembershipProjection.removed")(function* ({ payload }) {
      const groupMembershipStore = yield* GroupMembershipStore.Service;
      yield* groupMembershipStore.markRemoved(payload);
    }),
  );

export * as GroupMembershipProjection from "./projection.ts";
