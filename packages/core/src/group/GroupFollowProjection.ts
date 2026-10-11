import { Effect, Option } from "effect";
import * as Projection from "../journal/Projection.ts";
import * as GroupMembershipFacts from "./GroupMembershipFacts.ts";

import * as GroupFollowFacts from "./GroupFollowFacts.ts";
import * as GroupFollowStore from "./GroupFollowStore.ts";

/** Follows start and end by their own facts, and end with the admission they belong to. */
export const definition = Projection.make("group.follows", { version: 1 })
  .on(
    GroupFollowFacts.Started,
    Effect.fn("GroupFollowProjection.started")(function* ({ payload }) {
      const groupFollowStore = yield* GroupFollowStore.GroupFollowStore;
      yield* groupFollowStore.insert(payload);
    }),
  )
  .on(
    GroupFollowFacts.Ended,
    Effect.fn("GroupFollowProjection.ended")(function* ({ payload, provenance }) {
      const groupFollowStore = yield* GroupFollowStore.GroupFollowStore;
      yield* groupFollowStore.end(payload, provenance.occurredAt);
    }),
  )
  .on(
    GroupMembershipFacts.Removed,
    Effect.fn("GroupFollowProjection.admissionRemoved")(function* ({ payload, provenance }) {
      const groupFollowStore = yield* GroupFollowStore.GroupFollowStore;
      const found = yield* groupFollowStore.findActive(payload.membershipId);
      if (Option.isNone(found)) return;
      const follow = found.value;
      yield* groupFollowStore.end(
        {
          workspaceId: follow.workspaceId,
          groupId: follow.groupId,
          followId: follow.id,
          memberId: follow.memberId,
        },
        provenance.occurredAt,
      );
    }),
  );
