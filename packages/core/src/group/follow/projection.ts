import { Effect, Option } from "effect";
import { Projection } from "../../journal/projection.ts";
import { GroupMembershipFacts } from "../membership/facts.ts";

import { GroupFollowFacts } from "./facts.ts";
import { GroupFollowStore } from "./store.ts";

/** Follows start and end by their own facts, and end with the admission they belong to. */
export const definition = Projection.make("group.follows", { version: 1 })
  .on(
    GroupFollowFacts.Started,
    Effect.fn("GroupFollowProjection.started")(function* ({ payload }) {
      const store = yield* GroupFollowStore.Service;
      yield* store.insert(payload);
    }),
  )
  .on(
    GroupFollowFacts.Ended,
    Effect.fn("GroupFollowProjection.ended")(function* ({ payload, provenance }) {
      const store = yield* GroupFollowStore.Service;
      yield* store.end(payload, provenance.occurredAt);
    }),
  )
  .on(
    GroupMembershipFacts.Removed,
    Effect.fn("GroupFollowProjection.admissionRemoved")(function* ({ payload, provenance }) {
      const store = yield* GroupFollowStore.Service;
      const found = yield* store.findActive(payload.membershipId);
      if (Option.isNone(found)) return;
      const follow = found.value;
      yield* store.end(
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

export * as GroupFollowProjection from "./projection.ts";
