import { Effect } from "effect";
import * as Projection from "../journal/Projection.ts";

import * as RoleFacts from "./RoleFacts.ts";
import * as RoleStore from "./RoleStore.ts";

/** Projects recorded role changes into the host's transactional read model. */
export const definition = Projection.make("workspace.roles", { version: 1 })
  .on(
    RoleFacts.Created,
    Effect.fn("RoleProjection.created")(function* ({ payload }) {
      const roleStore = yield* RoleStore.RoleStore;
      yield* roleStore.insert({
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
      const roleStore = yield* RoleStore.RoleStore;
      yield* roleStore.rename(payload.roleId, payload.name);
    }),
  )
  .on(
    RoleFacts.PermissionsChanged,
    Effect.fn("RoleProjection.permissionsChanged")(function* ({ payload }) {
      const roleStore = yield* RoleStore.RoleStore;
      yield* roleStore.setPermissions(payload.roleId, payload.permissions);
    }),
  )
  .on(
    RoleFacts.BuiltinsRevised,
    Effect.fn("RoleProjection.builtinsRevised")(function* ({ payload }) {
      const roleStore = yield* RoleStore.RoleStore;
      yield* roleStore.recordBuiltinRevision(payload.revision);
    }),
  );
