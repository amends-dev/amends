import type { Identity } from "@amends/core/identity";
import { Member, Workspace } from "@amends/core/workspace";
import { WorkspaceDirectory } from "@amends/gateway";
import { DateTime, Effect, Layer, Schema } from "effect";
import { SqliteDatabase } from "./database.ts";
import { Invitations } from "./invitations.ts";
import { makeRecordDecoder } from "./record-column.ts";

const Memberships = Schema.Array(
  Schema.Struct({
    workspace: Schema.fromJsonString(Workspace.Record),
    member: Schema.fromJsonString(Member.Record),
    activeMemberCount: Schema.Natural,
  }),
);
const invitationRecords = makeRecordDecoder(Invitations.codec);

/**
 * One identity's workspaces, read from the projection tables across every
 * workspace in the database. This is host routing, not a core operation: it
 * reads read models directly and performs no authorization of its own.
 *
 * @category constructors
 */
export const make = Effect.fn("SqliteDirectory.make")(function* () {
  const { sql } = yield* SqliteDatabase.Service;
  const list: WorkspaceDirectory.Interface["list"] = Effect.fn("SqliteDirectory.list")(function* (
    identity: Identity.Reference,
  ) {
    const memberships =
      yield* sql`SELECT w.record AS workspace, m.record AS member, (SELECT COUNT(*) FROM members p WHERE p.workspace_id = m.workspace_id AND json_extract(p.record, '$.status') = 'active') AS activeMemberCount FROM members m JOIN workspaces w ON w.workspace_id = m.workspace_id WHERE json_extract(m.record, '$.identity._tag') = ${identity._tag} AND json_extract(m.record, '$.identity.id') = ${identity.id} ORDER BY w.workspace_id, m.id`.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Memberships)),
        Effect.orDie,
      );
    if (identity._tag !== "Human") return { memberships, invitations: [] };
    const now = yield* DateTime.now;
    const pending =
      yield* sql`SELECT record FROM invitations WHERE json_extract(record, '$.details.recipientId') = ${identity.id} AND json_extract(record, '$.state._tag') = 'Pending' ORDER BY workspace_id, id`.pipe(
        Effect.flatMap(invitationRecords),
        Effect.orDie,
      );
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

export * as SqliteDirectory from "./directory.ts";
