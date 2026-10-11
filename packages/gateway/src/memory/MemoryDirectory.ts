/**
 * The workspace directory in process memory, the reference implementation of
 * `WorkspaceDirectory.WorkspaceDirectory`: it reads the workspace, member, and invitation records
 * of every workspace in `MemoryDatabase` to list one identity's memberships and pending
 * invitations, in binary ID order.
 *
 * @since 0.1.0
 */
import { Identity } from "@amends-dev/core/identity";
import { MemoryDatabase, Rows } from "@amends-dev/core/memory";
import { Invitation, Member, Workspace } from "@amends-dev/core/workspace";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import * as WorkspaceDirectory from "../WorkspaceDirectory.ts";

const workspaces = Rows.make(Schema.fromJsonString(Workspace.Record));
const members = Rows.make(Schema.fromJsonString(Member.Record));
const invitations = Rows.make(Schema.fromJsonString(Invitation.Record));

/**
 * One identity's workspaces, read from committed records across every workspace in storage.
 * This is host routing, not a core operation: it reads records directly and performs no
 * authorization of its own.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("MemoryDirectory.make")(function* () {
  const database = yield* MemoryDatabase.MemoryDatabase;
  const list: WorkspaceDirectory.WorkspaceDirectory["Service"]["list"] = Effect.fn(
    "MemoryDirectory.list",
  )(function* (identity: Identity.MemberReference) {
    const now = yield* DateTime.now;
    const memberships: Array<WorkspaceDirectory.Membership> = [];
    const pending = [];
    const ids = [...database.spaces.keys()].toSorted(Rows.compareBinary);
    for (const workspaceId of ids) {
      const space = database.spaces.get(workspaceId);
      if (space === undefined) continue;
      const workspace = yield* workspaces.get(space.records.of("workspace"), workspaceId);
      const all = yield* members.all(space.records.of("members"));
      const activeMemberCount = all.filter((member) => member.status === "active").length;
      if (Option.isSome(workspace))
        for (const member of all.toSorted((left, right) => Rows.compareBinary(left.id, right.id)))
          if (
            Identity.MemberReference.isAnyOf([identity._tag])(member.identity) &&
            member.identity.id === identity.id
          )
            memberships.push({ workspace: workspace.value, member, activeMemberCount });
      if (!Identity.MemberReference.isAnyOf(["Human"])(identity)) continue;
      const issued = yield* invitations.all(space.records.of("invitations"));
      pending.push(
        ...issued
          .filter(
            (invitation) =>
              invitation.details.recipientId === identity.id &&
              Invitation.State.isAnyOf(["Pending"])(invitation.state) &&
              DateTime.isGreaterThan(invitation.details.expiresAt, now),
          )
          .toSorted((left, right) => Rows.compareBinary(left.details.id, right.details.id))
          .map((invitation) => ({
            ...invitation,
            ...(Option.isSome(workspace) ? { workspaceName: workspace.value.name } : {}),
          })),
      );
    }
    return { memberships, invitations: pending };
  }, Effect.orDie);
  return WorkspaceDirectory.WorkspaceDirectory.of({ list });
});

/**
 * Provide `WorkspaceDirectory.WorkspaceDirectory` over the `MemoryDatabase` beneath it.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(WorkspaceDirectory.WorkspaceDirectory, make());
