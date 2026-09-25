import type { Identity } from "@amends/core/identity";
import { Member, Workspace } from "@amends/core/workspace";
import { WorkspaceDirectory } from "@amends/gateway";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { MemoryConnection } from "./connection.ts";
import { Invitations } from "./invitations.ts";
import { compareBinary, Rows } from "./rows.ts";

const workspaces = Rows.make(Schema.fromJsonString(Workspace.Record));
const members = Rows.make(Schema.fromJsonString(Member.Record));

/**
 * One identity's workspaces, read from committed records across every workspace in storage.
 * This is host routing, not a core operation: it reads records directly and performs no
 * authorization of its own.
 *
 * @category constructors
 */
export const make = Effect.fn("MemoryDirectory.make")(function* () {
  const { database } = yield* MemoryConnection.Service;
  const list: WorkspaceDirectory.Interface["list"] = Effect.fn("MemoryDirectory.list")(function* (
    identity: Identity.MemberReference,
  ) {
    const now = yield* DateTime.now;
    const memberships: Array<WorkspaceDirectory.Membership> = [];
    const invitations = [];
    const ids = [...database.spaces.keys()].toSorted(compareBinary);
    for (const workspaceId of ids) {
      const space = database.spaces.get(workspaceId);
      if (space === undefined) continue;
      const workspace = yield* workspaces.get(space.records.workspace, workspaceId);
      const all = yield* members.all(space.records.members);
      const activeMemberCount = all.filter((member) => member.status === "active").length;
      if (Option.isSome(workspace))
        for (const member of all.toSorted((left, right) => compareBinary(left.id, right.id)))
          if (member.identity._tag === identity._tag && member.identity.id === identity.id)
            memberships.push({ workspace: workspace.value, member, activeMemberCount });
      if (identity._tag !== "Human") continue;
      const pending = yield* Invitations.rows.all(space.records.invitations);
      invitations.push(
        ...pending
          .filter(
            (invitation) =>
              invitation.details.recipientId === identity.id &&
              invitation.state._tag === "Pending" &&
              DateTime.isGreaterThan(invitation.details.expiresAt, now),
          )
          .toSorted((left, right) => compareBinary(left.details.id, right.details.id))
          .map((invitation) => ({
            ...invitation,
            ...(Option.isSome(workspace) ? { workspaceName: workspace.value.name } : {}),
          })),
      );
    }
    return { memberships, invitations };
  }, Effect.orDie);
  return WorkspaceDirectory.Service.of({ list });
});

/**
 * Provide WorkspaceDirectory.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(WorkspaceDirectory.Service, make());

export * as MemoryDirectory from "./directory.ts";
