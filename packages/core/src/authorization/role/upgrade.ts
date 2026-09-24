import { Effect, Option } from "effect";
import { Performer } from "../../identity/performer.ts";
import { Journal } from "../../journal/journal.ts";
import { Publication } from "../../journal/publication.ts";
import { WorkspaceStore } from "../../workspace/store.ts";
import { PermissionCatalog } from "../permission-catalog.ts";
import type { Permission } from "../permission.ts";
import { BuiltinRoles } from "./builtin.ts";
import { RoleFacts } from "./facts.ts";
import { RoleStore } from "./store.ts";

/** Who upgrades built-in roles: the product, not a member. */
export const performer = Performer.Reference.cases.System.make({
  id: Performer.SystemId.make("builtin-roles"),
});

/** The bundles to bring a workspace to; by default the current revision and catalog. */
export interface Target {
  readonly revision: number;
  readonly definitions: ReadonlyArray<Permission.Definition>;
}

const samePermissions = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length && left.every((name) => right.includes(name));

/**
 * Bring an initialized workspace's built-in roles to the target revision, in one commit
 * attributed to the system: create a missing built-in role, rename one whose name changed, and
 * replace permissions that differ, then record the revision. A workspace already at that
 * revision or a later one is left alone, so an older host never reverts a newer one's upgrade.
 * Hosts run this when they load a workspace; most find it current and open no transaction.
 * Returns whether it upgraded.
 */
export const upgrade = Effect.fn("BuiltinRoleUpgrade.upgrade")(function* (target?: Target) {
  const roles = yield* RoleStore.Service;
  const workspaces = yield* WorkspaceStore.Service;
  const journal = yield* Journal.Service;
  const catalog = yield* PermissionCatalog.Service;
  const workspaceId = roles.workspaceId;
  const revision = yield* BuiltinRoles.Revision.makeEffect(
    target?.revision ?? BuiltinRoles.revision,
  );
  const definitions = target?.definitions ?? catalog.definitions;
  // A workspace recorded before revisions existed holds the bundles of revision zero.
  const due = Effect.gen(function* () {
    if (Option.isNone(yield* workspaces.get)) return false;
    return Option.getOrElse(yield* roles.builtinRevision, () => 0) < revision;
  });
  if (!(yield* due)) return false;
  const provenance = yield* Publication.make(workspaceId, performer);
  return yield* journal.commit(
    Effect.gen(function* () {
      // Another host may have upgraded it meanwhile; writers take turns, so this check holds.
      if (!(yield* due)) return false;
      for (const role of BuiltinRoles.make(workspaceId, definitions)) {
        const found = yield* roles.get(role.id);
        if (Option.isNone(found)) {
          yield* journal.publish(RoleFacts.Created, {
            roleId: role.id,
            workspaceId,
            name: role.name,
            permissions: role.permissions,
          });
          continue;
        }
        if (found.value.name !== role.name)
          yield* journal.publish(RoleFacts.Renamed, {
            roleId: role.id,
            workspaceId,
            name: role.name,
          });
        if (!samePermissions(found.value.permissions, role.permissions))
          yield* journal.publish(RoleFacts.PermissionsChanged, {
            roleId: role.id,
            workspaceId,
            permissions: role.permissions,
          });
      }
      yield* journal.publish(RoleFacts.BuiltinsRevised, { workspaceId, revision });
      return true;
    }).pipe(Effect.provideService(Publication.Service, provenance)),
  );
});

export * as BuiltinRoleUpgrade from "./upgrade.ts";
