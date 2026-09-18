import { Effect, Schema } from "effect";
import { Projection } from "../../journal/projection.ts";
import { Workspace } from "../../workspace/workspace.ts";
import { RoleFacts } from "./facts.ts";
import { RoleStore } from "./store.ts";

export class WorkspaceMismatch extends Schema.TaggedError<WorkspaceMismatch>()(
  "RoleProjection.WorkspaceMismatch",
  { expectedWorkspaceId: Workspace.Id, actualWorkspaceId: Workspace.Id },
) {}

const requireStore = Effect.fnUntraced(function* (workspaceId: Workspace.Id) {
  const store = yield* RoleStore.Service;
  if (store.workspaceId !== workspaceId) {
    return yield* new WorkspaceMismatch({
      expectedWorkspaceId: store.workspaceId,
      actualWorkspaceId: workspaceId,
    });
  }
  return store;
});

/** Projects recorded role changes into the host's transactional read model. */
export const definition = Projection.make("workspace.roles", { version: 1 })
  .on(
    RoleFacts.Created,
    Effect.fn("RoleProjection.created")(function* ({ payload }) {
      const store = yield* requireStore(payload.workspaceId);
      yield* store.insert({
        id: payload.roleId,
        workspaceId: payload.workspaceId,
        name: payload.name,
        permissions: payload.permissions,
      });
    }),
  )
  .on(
    RoleFacts.Renamed,
    Effect.fn("RoleProjection.renamed")(function* ({ payload }) {
      const store = yield* requireStore(payload.workspaceId);
      yield* store.rename(payload.roleId, payload.name);
    }),
  )
  .on(
    RoleFacts.PermissionsChanged,
    Effect.fn("RoleProjection.permissionsChanged")(function* ({ payload }) {
      const store = yield* requireStore(payload.workspaceId);
      yield* store.setPermissions(payload.roleId, payload.permissions);
    }),
  );

export * as RoleProjection from "./projection.ts";
