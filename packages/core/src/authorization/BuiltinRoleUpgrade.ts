/**
 * Brings a workspace's built-in roles to the host's revision of their bundles. The gateway runs
 * `upgrade` each time it boots a workspace: one recorded at an earlier `BuiltinRoles.revision` is
 * brought up to date with `RoleFacts` in one commit attributed to the `builtin-roles` system, and
 * one at the same or a later revision is left alone, so an older host never reverts a newer one's
 * bundles.
 *
 * @since 0.1.0
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Performer from "../identity/Performer.ts";
import * as Journal from "../journal/Journal.ts";
import * as Publication from "../journal/Publication.ts";
import * as Store from "../journal/Store.ts";
import * as WorkspaceStore from "../workspace/WorkspaceStore.ts";
import * as PermissionCatalog from "./PermissionCatalog.ts";
import type * as Permission from "./Permission.ts";
import * as BuiltinRoles from "./BuiltinRoles.ts";
import * as RoleFacts from "./RoleFacts.ts";
import * as RoleStore from "./RoleStore.ts";

/**
 * Who upgrades built-in roles: the product, not a member.
 *
 * @category constructors
 * @since 0.1.0
 */
export const performer = Performer.Reference.cases.System.make({
  id: Performer.SystemId.make("builtin-roles"),
});

/**
 * The revision to bring a workspace's built-in roles to, and the permission definitions their
 * bundles are made from; by default the host's current revision and catalog.
 *
 * @category options
 * @since 0.1.0
 */
export interface Options {
  readonly revision: number;
  readonly definitions: ReadonlyArray<Permission.Definition>;
}

const haveSamePermissions = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length && left.every((name) => right.includes(name));

/**
 * Bring an initialized workspace's built-in roles to the revision `options` names, in one commit
 * attributed to the system: create a missing built-in role, rename one whose name changed, and
 * replace permissions that differ, then record the revision. A workspace already at that
 * revision or a later one is left alone, so an older host never reverts a newer one's upgrade.
 * Hosts run this when they load a workspace; most find it current and open no transaction.
 * Returns whether it upgraded.
 *
 * @category utils
 * @since 0.1.0
 */
export const upgrade = Effect.fn("BuiltinRoleUpgrade.upgrade")(function* (options?: Options) {
  const roleStore = yield* RoleStore.RoleStore;
  const workspaceStore = yield* WorkspaceStore.WorkspaceStore;
  const journal = yield* Journal.Journal;
  const permissionCatalog = yield* PermissionCatalog.PermissionCatalog;
  const { workspaceId } = yield* Store.Store;
  const revision = yield* BuiltinRoles.Revision.makeEffect(
    options?.revision ?? BuiltinRoles.revision,
  );
  const definitions = options?.definitions ?? permissionCatalog.definitions;
  // A workspace recorded before revisions existed holds the bundles of revision zero.
  const checkUpgradeDue = Effect.gen(function* () {
    if (Option.isNone(yield* workspaceStore.get)) return false;
    return Option.getOrElse(yield* roleStore.builtinRevision, () => 0) < revision;
  });
  if (!(yield* checkUpgradeDue)) return false;
  const provenance = yield* Publication.make(workspaceId, performer);
  return yield* journal.commit(
    Effect.gen(function* () {
      // Another host may have upgraded it meanwhile; writers take turns, so this check holds.
      if (!(yield* checkUpgradeDue)) return false;
      for (const role of BuiltinRoles.make(workspaceId, definitions)) {
        const found = yield* roleStore.get(role.id);
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
        if (!haveSamePermissions(found.value.permissions, role.permissions))
          yield* journal.publish(RoleFacts.PermissionsChanged, {
            roleId: role.id,
            workspaceId,
            permissions: role.permissions,
          });
      }
      yield* journal.publish(RoleFacts.BuiltinsRevised, { workspaceId, revision });
      return true;
    }).pipe(Effect.provideService(Publication.Publication, provenance)),
  );
});
