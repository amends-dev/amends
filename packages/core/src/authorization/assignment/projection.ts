import { Effect, Option } from "effect";
import { Projection } from "../../journal/projection.ts";

import { AssignmentFacts } from "./facts.ts";
import { AssignmentStore } from "./store.ts";

/** Projects recorded assignments and revocations without re-evaluating current authority. */
export const definition = Projection.make("workspace.assignments", { version: 1 })
  .on(
    AssignmentFacts.Created,
    Effect.fn("AssignmentProjection.created")(function* ({ payload }) {
      const store = yield* AssignmentStore.Service;
      yield* store.insert({
        id: payload.assignmentId,
        workspaceId: payload.workspaceId,
        memberId: payload.memberId,
        source: payload.source,
        status: "active",
      });
    }),
  )
  .on(
    AssignmentFacts.Revoked,
    Effect.fn("AssignmentProjection.revoked")(function* ({ payload }) {
      const store = yield* AssignmentStore.Service;
      const recorded = yield* store.get(payload.assignmentId);
      if (Option.isSome(recorded) && recorded.value.memberId !== payload.memberId)
        return yield* new AssignmentStore.Conflict({
          operation: "project",
          message: "Revocation names another member than its assignment",
        });
      yield* store.markRevoked(payload.assignmentId);
    }),
  );

export * as AssignmentProjection from "./projection.ts";
