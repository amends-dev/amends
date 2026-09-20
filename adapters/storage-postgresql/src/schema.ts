/**
 * Core's records as relational tables. Every table leads its primary key with
 * the workspace, and every reference between tables carries the workspace, so
 * a join that starts scoped stays scoped. Tagged unions become a discriminator
 * column plus the columns each case needs, constrained to agree.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  customType,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Drizzle types bytea as Buffer; core keeps payloads as Uint8Array and the client encodes them as such. */
const bytes = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const identityKinds = ["Human", "Agent"] as const;
export const memberStatuses = ["active", "removed"] as const;
export const assignmentStatuses = ["active", "revoked"] as const;
export const sourceKinds = ["Role", "Direct"] as const;
export const scopeKinds = ["Workspace", "Target"] as const;
export const targetKinds = ["Workspace", "Member"] as const;
export const invitationStates = ["Pending", "Accepted", "Revoked"] as const;
export const notificationStates = ["Pending"] as const;

/** A grant's scope: the whole workspace, or one exact target within it. The workspace is the row's. */
const scopeColumns = {
  scopeKind: text("scope_kind", { enum: scopeKinds }).notNull(),
  targetKind: text("target_kind", { enum: targetKinds }),
  targetMemberId: text("target_member_id"),
};
const scopeAgrees = (name: string, columns: Record<keyof typeof scopeColumns, AnyPgColumn>) =>
  check(
    name,
    sql`(${columns.scopeKind} = 'Workspace' AND ${columns.targetKind} IS NULL AND ${columns.targetMemberId} IS NULL) OR (${columns.scopeKind} = 'Target' AND ((${columns.targetKind} = 'Workspace' AND ${columns.targetMemberId} IS NULL) OR (${columns.targetKind} = 'Member' AND ${columns.targetMemberId} IS NOT NULL)))`,
  );

export const workspaces = pgTable("workspaces", {
  name: text("name").notNull(),
  workspaceId: text("workspace_id").primaryKey(),
  createdBy: text("created_by").notNull(),
  // Not a foreign key: the workspace record is projected before its owner's membership.
  ownerMemberId: text("owner_member_id").notNull(),
});

export const members = pgTable(
  "members",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    identityKind: text("identity_kind", { enum: identityKinds }).notNull(),
    identityId: text("identity_id").notNull(),
    status: text("status", { enum: memberStatuses }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspaces.workspaceId],
      name: "members_workspace",
    }).onDelete("cascade"),
    uniqueIndex("active_member_identity")
      .on(table.workspaceId, table.identityKind, table.identityId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const roles = pgTable(
  "roles",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    permissions: text("permissions").array().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspaces.workspaceId],
      name: "roles_workspace",
    }).onDelete("cascade"),
  ],
);

export const assignments = pgTable(
  "assignments",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    memberId: text("member_id").notNull(),
    status: text("status", { enum: assignmentStatuses }).notNull(),
    sourceKind: text("source_kind", { enum: sourceKinds }).notNull(),
    roleId: text("role_id"),
    permission: text("permission"),
    ...scopeColumns,
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspaces.workspaceId],
      name: "assignments_workspace",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.memberId],
      foreignColumns: [members.workspaceId, members.id],
      name: "assignments_member",
    }),
    foreignKey({
      columns: [table.workspaceId, table.roleId],
      foreignColumns: [roles.workspaceId, roles.id],
      name: "assignments_role",
    }),
    check(
      "assignments_source_agrees",
      sql`(${table.sourceKind} = 'Role' AND ${table.roleId} IS NOT NULL AND ${table.permission} IS NULL) OR (${table.sourceKind} = 'Direct' AND ${table.permission} IS NOT NULL AND ${table.roleId} IS NULL)`,
    ),
    scopeAgrees("assignments_scope_agrees", table),
    index("assignments_by_member").on(table.workspaceId, table.memberId, table.status),
    index("assignments_by_role").on(table.workspaceId, table.roleId, table.status),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    recipientId: text("recipient_id").notNull(),
    inviterMemberId: text("inviter_member_id").notNull(),
    roleId: text("role_id").notNull(),
    issuedAt: instant("issued_at").notNull(),
    expiresAt: instant("expires_at").notNull(),
    state: text("state", { enum: invitationStates }).notNull(),
    acceptedMemberId: text("accepted_member_id"),
    acceptedAt: instant("accepted_at"),
    revokedByMemberId: text("revoked_by_member_id"),
    revokedAt: instant("revoked_at"),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspaces.workspaceId],
      name: "invitations_workspace",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.inviterMemberId],
      foreignColumns: [members.workspaceId, members.id],
      name: "invitations_inviter",
    }),
    check(
      "invitations_state_agrees",
      sql`(${table.state} = 'Pending' AND ${table.acceptedMemberId} IS NULL AND ${table.acceptedAt} IS NULL AND ${table.revokedByMemberId} IS NULL AND ${table.revokedAt} IS NULL) OR (${table.state} = 'Accepted' AND ${table.acceptedMemberId} IS NOT NULL AND ${table.acceptedAt} IS NOT NULL AND ${table.revokedByMemberId} IS NULL AND ${table.revokedAt} IS NULL) OR (${table.state} = 'Revoked' AND ${table.revokedByMemberId} IS NOT NULL AND ${table.revokedAt} IS NOT NULL AND ${table.acceptedMemberId} IS NULL AND ${table.acceptedAt} IS NULL)`,
    ),
    index("invitations_by_recipient").on(table.workspaceId, table.recipientId, table.state),
    index("pending_invitations_by_recipient")
      .on(table.recipientId)
      .where(sql`${table.state} = 'Pending'`),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    sourceLogId: text("source_log_id").notNull(),
    sourceEntryId: text("source_entry_id").notNull(),
    recipientKind: text("recipient_kind", { enum: identityKinds }).notNull(),
    recipientId: text("recipient_id").notNull(),
    recordedAt: instant("recorded_at").notNull(),
    state: text("state", { enum: notificationStates }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspaces.workspaceId],
      name: "notifications_workspace",
    }).onDelete("cascade"),
    // Source existence and recipient selection belong to notification generation.
    uniqueIndex("notifications_by_source_recipient").on(
      table.workspaceId,
      table.sourceLogId,
      table.sourceEntryId,
      table.recipientKind,
      table.recipientId,
    ),
    index("notifications_by_recipient").on(
      table.workspaceId,
      table.recipientKind,
      table.recipientId,
      table.recordedAt,
      sql`${table.id} COLLATE "C"`,
    ),
    index("pending_notifications_by_recipient")
      .on(
        table.workspaceId,
        table.recipientKind,
        table.recipientId,
        table.recordedAt,
        sql`${table.id} COLLATE "C"`,
      )
      .where(sql`${table.state} = 'Pending'`),
    check("notifications_recipient_kind", sql`${table.recipientKind} IN ('Human', 'Agent')`),
    check("notifications_state", sql`${table.state} = 'Pending'`),
  ],
);

export const commits = pgTable(
  "commits",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    recordedAt: instant("recorded_at").notNull(),
    entryCount: integer("entry_count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.id] })],
);

export const logBatches = pgTable(
  "log_batches",
  {
    workspaceId: text("workspace_id").notNull(),
    logId: text("log_id").notNull(),
    position: integer("position").notNull(),
    commitId: text("commit_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.logId, table.position] }),
    uniqueIndex("log_batches_by_commit").on(table.workspaceId, table.logId, table.commitId),
    foreignKey({
      columns: [table.workspaceId, table.commitId],
      foreignColumns: [commits.workspaceId, commits.id],
      name: "log_batches_commit",
    }),
  ],
);

export const logEntries = pgTable(
  "log_entries",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    logId: text("log_id").notNull(),
    position: integer("position").notNull(),
    commitId: text("commit_id").notNull(),
    entryIndex: integer("entry_index").notNull(),
    recordedAt: instant("recorded_at").notNull(),
    payload: bytes("payload").notNull(),
    factName: text("fact_name"),
    factVersion: doublePrecision("fact_version"),
    performerKind: text("performer_kind", { enum: ["Member", "Identity", "System"] }),
    performerMemberId: text("performer_member_id"),
    performerIdentityKind: text("performer_identity_kind", { enum: identityKinds }),
    performerIdentityId: text("performer_identity_id"),
    performerSystemId: text("performer_system_id"),
    causeLogId: text("cause_log_id"),
    causeCommitId: text("cause_commit_id"),
    causeEntryId: text("cause_entry_id"),
    correlationId: text("correlation_id"),
    occurredAt: instant("occurred_at"),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    uniqueIndex("log_entries_by_position").on(
      table.workspaceId,
      table.logId,
      table.position,
      table.entryIndex,
    ),
    index("log_entries_by_fact").on(
      table.workspaceId,
      table.logId,
      table.factName,
      table.position,
      table.entryIndex,
    ),
    check(
      "log_entries_fact_header",
      sql`(${table.factName} IS NULL AND ${table.factVersion} IS NULL AND ${table.performerKind} IS NULL) OR (${table.factName} IS NOT NULL AND ${table.factVersion} IS NOT NULL AND ${table.performerKind} IS NOT NULL)`,
    ),
    check(
      "log_entries_provenance",
      sql`(${table.performerKind} IS NULL AND ${table.performerMemberId} IS NULL AND ${table.performerIdentityKind} IS NULL AND ${table.performerIdentityId} IS NULL AND ${table.performerSystemId} IS NULL AND ${table.correlationId} IS NULL AND ${table.occurredAt} IS NULL AND ${table.causeLogId} IS NULL AND ${table.causeCommitId} IS NULL AND ${table.causeEntryId} IS NULL) OR (${table.performerKind} IS NOT NULL AND ${table.correlationId} IS NOT NULL AND ${table.occurredAt} IS NOT NULL AND ((${table.performerKind} = 'Member' AND ${table.performerMemberId} IS NOT NULL AND ${table.performerIdentityKind} IN ('Human', 'Agent') AND ${table.performerIdentityKind} IS NOT NULL AND ${table.performerIdentityId} IS NOT NULL AND ${table.performerSystemId} IS NULL) OR (${table.performerKind} = 'Identity' AND ${table.performerMemberId} IS NULL AND ${table.performerIdentityKind} IN ('Human', 'Agent') AND ${table.performerIdentityKind} IS NOT NULL AND ${table.performerIdentityId} IS NOT NULL AND ${table.performerSystemId} IS NULL) OR (${table.performerKind} = 'System' AND ${table.performerMemberId} IS NULL AND ${table.performerIdentityKind} IS NULL AND ${table.performerIdentityId} IS NULL AND ${table.performerSystemId} IS NOT NULL)))`,
    ),
    check(
      "log_entries_cause",
      sql`(${table.causeLogId} IS NULL AND ${table.causeCommitId} IS NULL AND ${table.causeEntryId} IS NULL) OR (${table.causeLogId} IS NOT NULL AND ${table.causeCommitId} IS NOT NULL AND ${table.causeEntryId} IS NOT NULL)`,
    ),
    foreignKey({
      columns: [table.workspaceId, table.logId, table.position],
      foreignColumns: [logBatches.workspaceId, logBatches.logId, logBatches.position],
      name: "log_entries_batch",
    }),
  ],
);

export const logAppendKeys = pgTable(
  "log_append_keys",
  {
    workspaceId: text("workspace_id").notNull(),
    logId: text("log_id").notNull(),
    key: text("idempotency_key").notNull(),
    commitId: text("commit_id").notNull(),
    firstIndex: integer("first_index").notNull(),
    entryCount: integer("entry_count").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.logId, table.key] }),
    check("log_append_keys_first_index", sql`${table.firstIndex} >= 0`),
    check("log_append_keys_entry_count", sql`${table.entryCount} > 0`),
    foreignKey({
      columns: [table.workspaceId, table.logId, table.commitId],
      foreignColumns: [logBatches.workspaceId, logBatches.logId, logBatches.commitId],
      name: "log_append_keys_batch",
    }),
  ],
);

export const checkpoints = pgTable(
  "checkpoints",
  {
    workspaceId: text("workspace_id").notNull(),
    logId: text("log_id").notNull(),
    name: text("name").notNull(),
    version: doublePrecision("version").notNull(),
    position: integer("position").notNull(),
    commitId: text("commit_id").notNull(),
    entryIndex: integer("entry_index").notNull(),
    entryId: text("entry_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.logId, table.name, table.version] })],
);
