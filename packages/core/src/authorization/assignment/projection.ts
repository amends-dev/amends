import { Effect, Option, Schema } from "effect";
import { Projection } from "../../journal/projection.ts";
import { Workspace } from "../../workspace/workspace.ts";
import { AssignmentFacts } from "./facts.ts";
import { AssignmentStore } from "./store.ts";

export class WorkspaceMismatch extends Schema.TaggedError<WorkspaceMismatch>()(
  "AssignmentProjection.WorkspaceMismatch",
  { expectedWorkspaceId: Workspace.Id, actualWorkspaceId: Workspace.Id },
) {}

const requireStore = Effect.fnUntraced(function* (workspaceId: Workspace.Id) {
  const store = yield* AssignmentStore.Service;
  if (store.workspaceId !== workspaceId) {
    return yield* new WorkspaceMismatch({
      expectedWorkspaceId: store.workspaceId,
      actualWorkspaceId: workspaceId,
    });
  }
  return store;
});

/** Projects recorded assignments and revocations without re-evaluating current authority. */
export const definition = Projection.make("workspace.assignments", { version: 1 })
  .on(
    AssignmentFacts.Created,
    Effect.fn("AssignmentProjection.created")(function* ({ payload }) {
      const store = yield* requireStore(payload.workspaceId);
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
      const store = yield* requireStore(payload.workspaceId);
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
