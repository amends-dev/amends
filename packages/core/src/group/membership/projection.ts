import { Effect } from "effect";
import * as Projection from "../../journal/projection.ts";
import * as GroupMembershipFacts from "./facts.ts";
import * as GroupMembershipStore from "./store.ts";

export const definition = Projection.make("group.memberships", { version: 1 })
  .on(
    GroupMembershipFacts.Added,
    Effect.fn("GroupMembershipProjection.added")(function* ({ payload }) {
      const groupMembershipStore = yield* GroupMembershipStore.GroupMembershipStore;
      yield* groupMembershipStore.insert(payload);
    }),
  )
  .on(
    GroupMembershipFacts.Removed,
    Effect.fn("GroupMembershipProjection.removed")(function* ({ payload }) {
      const groupMembershipStore = yield* GroupMembershipStore.GroupMembershipStore;
      yield* groupMembershipStore.markRemoved(payload);
    }),
  );
