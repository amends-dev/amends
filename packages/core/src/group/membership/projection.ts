import { Effect } from "effect";
import { Projection } from "../../journal/projection.ts";
import { GroupMembershipFacts } from "./facts.ts";
import { GroupMembershipStore } from "./store.ts";

export const definition = Projection.make("group.memberships", { version: 1 }).on(
  GroupMembershipFacts.Added,
  Effect.fn("GroupMembershipProjection.added")(function* ({ payload }) {
    const store = yield* GroupMembershipStore.Service;
    if (store.workspaceId !== payload.workspaceId)
      return yield* new GroupMembershipStore.Conflict({
        operation: "project",
        message: "Fact belongs to another workspace",
      });
    yield* store.insert(payload);
  }),
);

export * as GroupMembershipProjection from "./projection.ts";
