/**
 * Keeps the admission read model, `GroupMembershipStore`: each admission as it was added, and
 * ended once its member was removed or left.
 *
 * @since 0.1.0
 */
import * as Effect from "effect/Effect";
import * as Projection from "../journal/Projection.ts";
import * as GroupMembershipFacts from "./GroupMembershipFacts.ts";
import * as GroupMembershipStore from "./GroupMembershipStore.ts";

/**
 * Inserts each added admission and marks each removed one ended, keeping its other fields.
 *
 * @category projections
 * @since 0.1.0
 */
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
