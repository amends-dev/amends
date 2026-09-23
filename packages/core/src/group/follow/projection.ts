import { Effect, Option, Schema } from "effect";
import { Projection } from "../../journal/projection.ts";
import { GroupMembershipFacts } from "../membership/facts.ts";
import { GroupFollow } from "./follow.ts";
import { GroupFollowFacts } from "./facts.ts";
import { GroupFollowStore } from "./store.ts";

const foreign = (operation: string) =>
  new GroupFollowStore.Conflict({ operation, message: "Fact belongs to another workspace" });

/** Follows start and end by their own facts, and end with the admission they belong to. */
export const definition = Projection.make("group.follows", { version: 1 })
  .on(
    GroupFollowFacts.Started,
    Effect.fn("GroupFollowProjection.started")(function* ({ payload }) {
      const store = yield* GroupFollowStore.Service;
      if (store.workspaceId !== payload.workspaceId) return yield* foreign("project");
      yield* store.insert(payload);
    }),
  )
  .on(
    GroupFollowFacts.Ended,
    Effect.fn("GroupFollowProjection.ended")(function* ({ payload, provenance }) {
      const store = yield* GroupFollowStore.Service;
      if (store.workspaceId !== payload.workspaceId) return yield* foreign("project");
      yield* store.end(payload, provenance.occurredAt);
    }),
  )
  .on(
    GroupMembershipFacts.Removed,
    Effect.fn("GroupFollowProjection.admissionRemoved")(function* ({ payload, provenance }) {
      const store = yield* GroupFollowStore.Service;
      if (store.workspaceId !== payload.workspaceId) return yield* foreign("project");
      const found = yield* store.findActive(payload.membershipId);
      if (Option.isNone(found)) return;
      const follow = yield* Schema.decodeEffect(Schema.toType(GroupFollow.Record))(found.value);
      if (
        follow.workspaceId !== payload.workspaceId ||
        follow.groupId !== payload.groupId ||
        follow.memberId !== payload.memberId ||
        follow.groupMembershipId !== payload.membershipId
      )
        return yield* new GroupFollowStore.Conflict({
          operation: "project",
          message: "Follow store returned another admission's follow",
        });
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
