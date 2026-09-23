import type { Identity } from "@amends/core/identity";
import { Member, Workspace } from "@amends/core/workspace";
import { WorkspaceDirectory } from "@amends/gateway";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DateTime, Effect, Layer, Schema } from "effect";
import { PostgresDatabase } from "./database.ts";
import { Invitations } from "./invitations.ts";
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
  const { db } = yield* PostgresDatabase.Service;
  const list: WorkspaceDirectory.Interface["list"] = Effect.fn("PostgresDirectory.list")(function* (
    identity: Identity.MemberReference,
  ) {
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
                status: member.status,
              },
              activeMemberCount,
            })),
          ),
        ),
        Effect.orDie,
      );
    if (identity._tag !== "Human") return { memberships, invitations: [] };
    const now = yield* DateTime.now;
    const pending = yield* Invitations.select(
      db,
      and(eq(invitations.recipientId, identity.id), eq(invitations.state, "Pending")),
      [asc(invitations.workspaceId), asc(invitations.id)],
    ).pipe(Effect.orDie);
    return {
      memberships,
      invitations: pending.filter((invitation) =>
        DateTime.isGreaterThan(invitation.details.expiresAt, now),
      ),
    };
  });
  return WorkspaceDirectory.Service.of({ list });
});

/**
 * Provide WorkspaceDirectory.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(WorkspaceDirectory.Service, make());

export * as PostgresDirectory from "./directory.ts";
