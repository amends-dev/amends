import type { Identity } from "@amends/core/identity";
import { Member, Workspace } from "@amends/core/workspace";
import { WorkspaceDirectory } from "@amends/gateway";
import { and, asc, count, eq } from "drizzle-orm";
import { DateTime, Effect, Layer, Schema } from "effect";
import { PostgresDatabase } from "./database.ts";
import { Invitations } from "./invitations.ts";
import { invitations, members, workspaces } from "./schema.ts";

const Membership = Schema.Struct({
  workspace: Workspace.Record,
  member: Member.Record,
  people: Schema.Int,
});

/**
 * One identity's workspaces, read from the projection tables across every
 * workspace in the database. This is host routing, not a core operation: it
 * reads read models directly and performs no authorization of its own.
 */
export const make = Effect.fn("PostgresDirectory.make")(function* () {
  const { db } = yield* PostgresDatabase.Service;
  const list: WorkspaceDirectory.Interface["list"] = Effect.fn("PostgresDirectory.list")(function* (
    identity: Identity.Reference,
  ) {
    const active = db
      .select({ workspaceId: members.workspaceId, people: count().as("people") })
      .from(members)
      .where(eq(members.status, "active"))
      .groupBy(members.workspaceId)
      .as("active");
    const memberships = yield* db
      .select({
        workspace: {
          id: workspaces.workspaceId,
          createdBy: workspaces.createdBy,
          ownerMemberId: workspaces.ownerMemberId,
        },
        // Selections nest one level, so the identity union is nested below.
        member: members,
        people: active.people,
      })
      .from(members)
      .innerJoin(workspaces, eq(workspaces.workspaceId, members.workspaceId))
      .innerJoin(active, eq(active.workspaceId, members.workspaceId))
      .where(and(eq(members.identityKind, identity._tag), eq(members.identityId, identity.id)))
      .orderBy(asc(workspaces.workspaceId), asc(members.id))
      .pipe(
        Effect.flatMap((rows) =>
          Schema.decodeUnknownEffect(Schema.Array(Membership))(
            rows.map(({ workspace, member, people }) => ({
              workspace,
              member: {
                id: member.id,
                workspaceId: member.workspaceId,
                identity: { _tag: member.identityKind, id: member.identityId },
                status: member.status,
              },
              people,
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

export const layer = Layer.effect(WorkspaceDirectory.Service, make());

export * as PostgresDirectory from "./directory.ts";
