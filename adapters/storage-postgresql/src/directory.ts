import { Identity } from "@amends-dev/core/identity";
import { Member, Workspace } from "@amends-dev/core/workspace";
import { WorkspaceDirectory } from "@amends-dev/gateway";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DateTime, Effect, Layer, Schema } from "effect";
import * as PostgresDatabase from "./database.ts";
import * as Invitations from "./invitations.ts";
import { invitations, members, workspaces } from "./schema.ts";

const Membership = Schema.Struct({
  workspace: Workspace.Record,
  member: Member.Record,
  activeMemberCount: Schema.Natural,
});

/**
 * One identity's workspaces, read from the projection tables across every
 * workspace in the database. This is host routing, not a core operation: it
 * reads read models directly and performs no authorization of its own.
 *
 * @category constructors
 */
export const make = Effect.fn("PostgresDirectory.make")(function* () {
  const { db } = yield* PostgresDatabase.PostgresDatabase;
  const list: WorkspaceDirectory.WorkspaceDirectory["Service"]["list"] = Effect.fn(
    "PostgresDirectory.list",
  )(function* (identity: Identity.MemberReference) {
    // Count only the identity's workspaces; a workspace without active members still lists at zero.
    const active = alias(members, "active_members");
    const activeMemberCount = db
      .select({ value: count() })
      .from(active)
      .where(and(eq(active.workspaceId, members.workspaceId), eq(active.status, "active")));
    const memberships = yield* db
      .select({
        workspace: {
          id: workspaces.workspaceId,
          name: workspaces.name,
          createdBy: workspaces.createdBy,
          ownerMemberId: workspaces.ownerMemberId,
        },
        // Selections nest one level, so the identity union is nested below.
        member: members,
        activeMemberCount: sql<number>`(${activeMemberCount})`.mapWith(Number),
      })
      .from(members)
      .innerJoin(workspaces, eq(workspaces.workspaceId, members.workspaceId))
      .where(and(eq(members.identityKind, identity._tag), eq(members.identityId, identity.id)))
      .orderBy(asc(members.workspaceId), asc(members.id))
      .pipe(
        Effect.flatMap((rows) =>
          Schema.decodeEffect(Schema.Array(Membership))(
            rows.map(({ workspace, member, activeMemberCount }) => ({
              workspace,
              member: {
                id: member.id,
                workspaceId: member.workspaceId,
                identity: { _tag: member.identityKind, id: member.identityId },
                name: member.name,
                status: member.status,
              },
              activeMemberCount,
            })),
          ),
        ),
        Effect.orDie,
      );
    if (!Identity.MemberReference.isAnyOf(["Human"])(identity))
      return { memberships, invitations: [] };
    const now = yield* DateTime.now;
    const pending = yield* Invitations.select(
      db,
      and(eq(invitations.recipientId, identity.id), eq(invitations.state, "Pending")),
      [asc(invitations.workspaceId), asc(invitations.id)],
    ).pipe(Effect.orDie);
    const visible = pending.filter((invitation) =>
      DateTime.isGreaterThan(invitation.details.expiresAt, now),
    );
    const names = visible.length
      ? yield* db
          .select({ id: workspaces.workspaceId, name: workspaces.name })
          .from(workspaces)
          .where(
            inArray(
              workspaces.workspaceId,
              visible.map((invitation) => invitation.details.workspaceId),
            ),
          )
          .pipe(Effect.orDie)
      : [];
    return {
      memberships,
      invitations: visible.map((invitation) => {
        const name = names.find((row) => row.id === invitation.details.workspaceId)?.name;
        return { ...invitation, ...(name === undefined ? {} : { workspaceName: name }) };
      }),
    };
  });
  return WorkspaceDirectory.WorkspaceDirectory.of({ list });
});

/**
 * Provide WorkspaceDirectory.WorkspaceDirectory using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(WorkspaceDirectory.WorkspaceDirectory, make());
