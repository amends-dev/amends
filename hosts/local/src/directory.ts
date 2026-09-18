import type { Identity } from "@amends/core/identity";
import { Invitation, Member, Workspace } from "@amends/core/workspace";
import { WorkspaceDirectory } from "@amends/gateway";
import { DateTime, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

const MembershipRow = Schema.Struct({
  workspace: Schema.fromJsonString(Workspace.Record),
  member: Schema.fromJsonString(Member.Record),
  people: Schema.Int,
});
const InvitationRow = Schema.Struct({ record: Schema.fromJsonString(Invitation.Record) });

/**
 * One identity's workspaces, read from the host's projection tables across
 * every workspace in the database. This is host routing, not a core operation:
 * it reads read models directly and performs no authorization of its own.
 */
export const make = Effect.fn("LocalDirectory.make")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const list: WorkspaceDirectory.Interface["list"] = Effect.fn("LocalDirectory.list")(function* (
    identity: Identity.Reference,
  ) {
    const memberships =
      yield* sql`SELECT w.record AS workspace, m.record AS member, (SELECT COUNT(*) FROM members p WHERE p.workspace_id = m.workspace_id AND json_extract(p.record, '$.status') = 'active') AS people FROM members m JOIN workspaces w ON w.workspace_id = m.workspace_id WHERE json_extract(m.record, '$.identity._tag') = ${identity._tag} AND json_extract(m.record, '$.identity.id') = ${identity.id} ORDER BY w.workspace_id, m.id`.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(MembershipRow))),
        Effect.orDie,
      );
    if (identity._tag !== "Human") return { memberships, invitations: [] };
    const now = yield* DateTime.now;
    const invitations =
      yield* sql`SELECT record FROM invitations WHERE json_extract(record, '$.details.recipientId') = ${identity.id} AND json_extract(record, '$.state._tag') = 'Pending' ORDER BY workspace_id, id`.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(InvitationRow))),
        Effect.orDie,
      );
    return {
      memberships,
      invitations: invitations
        .map((row) => row.record)
        .filter((invitation) => DateTime.isGreaterThan(invitation.details.expiresAt, now)),
    };
  });
  return WorkspaceDirectory.Service.of({ list });
});

export const layer = Layer.effect(WorkspaceDirectory.Service, make());

export * as LocalDirectory from "./directory.ts";
