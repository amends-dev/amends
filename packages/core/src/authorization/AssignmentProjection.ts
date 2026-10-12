/**
 * Keeps the assignment read model, `AssignmentStore`: each assignment as it was created, and
 * revoked once its revocation is recorded.
 *
 * @since 0.1.0
 */
import { Effect, Option } from "effect";
import * as Projection from "../journal/Projection.ts";

import * as AssignmentFacts from "./AssignmentFacts.ts";
import * as AssignmentStore from "./AssignmentStore.ts";
import * as StoreError from "../journal/StoreError.ts";

/**
 * Inserts each created assignment and marks each revoked one, without re-evaluating current
 * authority. A revocation naming another member than its assignment is rejected.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("workspace.assignments", { version: 1 })
  .on(
    AssignmentFacts.Created,
    Effect.fn("AssignmentProjection.created")(function* ({ payload }) {
      const assignmentStore = yield* AssignmentStore.AssignmentStore;
      yield* assignmentStore.insert({
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
      const assignmentStore = yield* AssignmentStore.AssignmentStore;
      const recorded = yield* assignmentStore.get(payload.assignmentId);
      if (Option.isSome(recorded) && recorded.value.memberId !== payload.memberId)
        return yield* StoreError.rejected(
          "AssignmentStore",
          "project",
          "Revocation names another member than its assignment",
        );
      yield* assignmentStore.markRevoked(payload.assignmentId);
    }),
  );
