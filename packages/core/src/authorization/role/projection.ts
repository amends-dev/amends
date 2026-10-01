import { Effect } from "effect";
import { Projection } from "../../journal/projection.ts";

import { RoleFacts } from "./facts.ts";
import { RoleStore } from "./store.ts";

/** Projects recorded role changes into the host's transactional read model. */
export const definition = Projection.make("workspace.roles", { version: 1 })
  .on(
    RoleFacts.Created,
    Effect.fn("RoleProjection.created")(function* ({ payload }) {
      const store = yield* RoleStore.Service;
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
      const store = yield* RoleStore.Service;
      yield* store.rename(payload.roleId, payload.name);
    }),
  )
  .on(
    RoleFacts.PermissionsChanged,
    Effect.fn("RoleProjection.permissionsChanged")(function* ({ payload }) {
      const store = yield* RoleStore.Service;
      yield* store.setPermissions(payload.roleId, payload.permissions);
    }),
  )
  .on(
    RoleFacts.BuiltinsRevised,
    Effect.fn("RoleProjection.builtinsRevised")(function* ({ payload }) {
      const store = yield* RoleStore.Service;
      yield* store.recordBuiltinRevision(payload.revision);
    }),
  );

export * as RoleProjection from "./projection.ts";
