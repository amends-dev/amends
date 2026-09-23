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

export const memberIdentityKinds = ["Human", "Agent"] as const;
export const identityKinds = [...memberIdentityKinds, "Contact"] as const;
export const recipientKinds = [...identityKinds, "Triage"] as const;
export const memberStatuses = ["active", "removed"] as const;
export const groupKinds = ["Team", "Direct"] as const;
export const participantKinds = ["Member", "Contact", "Triage"] as const;
export const assignmentStatuses = ["active", "revoked"] as const;
export const sourceKinds = ["Role", "Direct"] as const;
export const scopeKinds = ["Workspace", "Target"] as const;
export const targetKinds = ["Workspace", "Member", "Thread", "Group"] as const;
export const invitationStates = ["Pending", "Accepted", "Revoked"] as const;
export const notificationStates = ["Pending", "Discarded", "Acknowledged"] as const;

/** A grant's scope: the whole workspace, or one exact target within it. The workspace is the row's. */
const scopeColumns = {
  scopeKind: text("scope_kind", { enum: scopeKinds }).notNull(),
  targetKind: text("target_kind", { enum: targetKinds }),
  targetMemberId: text("target_member_id"),
  targetThreadId: text("target_thread_id"),
  targetGroupId: text("target_group_id"),
};
const scopeAgrees = (name: string, columns: Record<keyof typeof scopeColumns, AnyPgColumn>) =>
  check(
    name,
    sql`(${columns.scopeKind} = 'Workspace' AND ${columns.targetKind} IS NULL AND ${columns.targetMemberId} IS NULL AND ${columns.targetThreadId} IS NULL AND ${columns.targetGroupId} IS NULL) OR (${columns.scopeKind} = 'Target' AND ${columns.targetKind} IS NOT NULL AND ((${columns.targetKind} = 'Workspace' AND ${columns.targetMemberId} IS NULL AND ${columns.targetThreadId} IS NULL AND ${columns.targetGroupId} IS NULL) OR (${columns.targetKind} = 'Member' AND ${columns.targetMemberId} IS NOT NULL AND ${columns.targetThreadId} IS NULL AND ${columns.targetGroupId} IS NULL) OR (${columns.targetKind} = 'Thread' AND ${columns.targetThreadId} IS NOT NULL AND ${columns.targetMemberId} IS NULL AND ${columns.targetGroupId} IS NULL) OR (${columns.targetKind} = 'Group' AND ${columns.targetGroupId} IS NOT NULL AND ${columns.targetMemberId} IS NULL AND ${columns.targetThreadId} IS NULL)))`,
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
    identityKind: text("identity_kind", { enum: memberIdentityKinds }).notNull(),
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
    check("members_identity_kind", sql`${table.identityKind} IN ('Human', 'Agent')`),
    uniqueIndex("active_member_identity")
      .on(table.workspaceId, table.identityKind, table.identityId)
      .where(sql`${table.status} = 'active'`),
    // Directory reads cross workspaces, so this leads with the identity rather than the workspace.
    index("members_by_identity").on(
      table.identityKind,
      table.identityId,
      table.workspaceId,
      table.id,
    ),
  ],
);

export const groups = pgTable(
  "groups",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    kind: text("kind", { enum: groupKinds }).notNull(),
    // Team groups carry a visibility and name; direct groups carry their fixed members and key.
    visibility: text("visibility", { enum: ["Private"] }),
    name: text("name"),
    memberIds: text("member_ids").array(),
    directKey: text("direct_key"),
    createdBy: text("created_by").notNull(),
    createdAt: instant("created_at").notNull(),
    // When any of the group's threads last had content activity.
    latestActivityAt: instant("latest_activity_at"),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.createdBy],
      foreignColumns: [members.workspaceId, members.id],
      name: "groups_creator",
    }),
    check(
      "groups_kind",
      sql`(${table.kind} = 'Team' AND ${table.visibility} = 'Private' AND ${table.name} IS NOT NULL AND ${table.memberIds} IS NULL AND ${table.directKey} IS NULL) OR (${table.kind} = 'Direct' AND ${table.visibility} IS NULL AND ${table.name} IS NULL AND cardinality(${table.memberIds}) >= 2 AND ${table.directKey} IS NOT NULL)`,
    ),
    // One direct group per exact member set.
    uniqueIndex("direct_groups_by_members")
      .on(table.workspaceId, table.directKey)
      .where(sql`${table.directKey} IS NOT NULL`),
  ],
);

export const groupMemberships = pgTable(
  "group_memberships",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    groupId: text("group_id").notNull(),
    memberId: text("member_id").notNull(),
    admittedAt: instant("admitted_at").notNull(),
    status: text("status", { enum: memberStatuses }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.groupId],
      foreignColumns: [groups.workspaceId, groups.id],
      name: "group_memberships_group",
    }),
    foreignKey({
      columns: [table.workspaceId, table.memberId],
      foreignColumns: [members.workspaceId, members.id],
      name: "group_memberships_member",
    }),
    check("group_memberships_status", sql`${table.status} IN ('active', 'removed')`),
    uniqueIndex("active_group_membership")
      .on(table.workspaceId, table.groupId, table.memberId)
      .where(sql`${table.status} = 'active'`),
    index("group_memberships_by_group").on(
      table.workspaceId,
      table.groupId,
      sql`${table.id} COLLATE "C"`,
    ),
    index("group_memberships_by_member").on(
      table.workspaceId,
      table.memberId,
      sql`${table.id} COLLATE "C"`,
    ),
    // A member's current groups, paged in group-ID order.
    index("active_group_memberships_by_member")
      .on(table.workspaceId, table.memberId, sql`${table.groupId} COLLATE "C"`)
      .where(sql`${table.status} = 'active'`),
  ],
);

/** A follow belongs to one admission; each admission follows its group at most once at a time. */
export const groupFollows = pgTable(
  "group_follows",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    groupId: text("group_id").notNull(),
    memberId: text("member_id").notNull(),
    groupMembershipId: text("group_membership_id").notNull(),
    followedAt: instant("followed_at").notNull(),
    status: text("status", { enum: ["active", "ended"] }).notNull(),
    endedAt: instant("ended_at"),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    foreignKey({
      columns: [t.workspaceId, t.groupId],
      foreignColumns: [groups.workspaceId, groups.id],
      name: "group_follows_group",
    }),
    foreignKey({
      columns: [t.workspaceId, t.memberId],
      foreignColumns: [members.workspaceId, members.id],
      name: "group_follows_member",
    }),
    foreignKey({
      columns: [t.workspaceId, t.groupMembershipId],
      foreignColumns: [groupMemberships.workspaceId, groupMemberships.id],
      name: "group_follows_admission",
    }),
    uniqueIndex("active_group_follow")
      .on(t.workspaceId, t.groupMembershipId)
      .where(sql`${t.status} = 'active'`),
    index("group_follows_by_group").on(t.workspaceId, t.groupId, sql`${t.id} COLLATE "C"`),
    check(
      "group_follow_state",
      sql`(${t.status} = 'active' AND ${t.endedAt} IS NULL) OR (${t.status} = 'ended' AND ${t.endedAt} IS NOT NULL)`,
    ),
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
    participationId: text("participation_id"),
    discardReason: text("discard_reason", { enum: ["participation-ended"] }),
    acknowledgmentOutcome: text("acknowledgment_outcome", { enum: ["Seen"] }),
    acknowledgedAt: instant("acknowledged_at"),
    recipientKind: text("recipient_kind", { enum: recipientKinds }).notNull(),
    recipientId: text("recipient_id"),
    recordedAt: instant("recorded_at").notNull(),
    state: text("state", { enum: notificationStates }).notNull(),
    // The thread, its group, and the timeline position of thread-activity notifications.
    threadId: text("thread_id"),
    threadGroupId: text("thread_group_id"),
    threadSequence: integer("thread_sequence"),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspaces.workspaceId],
      name: "notifications_workspace",
    }).onDelete("cascade"),
    check(
      "notification_state",
      sql`(${table.state} = 'Pending' AND ${table.discardReason} IS NULL AND ${table.acknowledgmentOutcome} IS NULL AND ${table.acknowledgedAt} IS NULL) OR (${table.state} = 'Discarded' AND ${table.discardReason} IS NOT NULL AND ${table.discardReason} = 'participation-ended' AND ${table.acknowledgmentOutcome} IS NULL AND ${table.acknowledgedAt} IS NULL) OR (${table.state} = 'Acknowledged' AND ${table.discardReason} IS NULL AND ${table.acknowledgmentOutcome} IS NOT NULL AND ${table.acknowledgmentOutcome} = 'Seen' AND ${table.acknowledgedAt} IS NOT NULL AND ${table.recipientKind} = 'Human')`,
    ),
    // Source existence and recipient selection belong to notification generation.
    uniqueIndex("notifications_by_source_recipient").on(
      table.workspaceId,
      table.sourceLogId,
      table.sourceEntryId,
      table.recipientKind,
      sql`coalesce(${table.recipientId}, '')`,
    ),
    index("notifications_by_recipient").on(
      table.workspaceId,
      table.recipientKind,
      sql`coalesce(${table.recipientId}, '')`,
      table.recordedAt,
      sql`${table.id} COLLATE "C"`,
    ),
    index("pending_notifications_by_recipient")
      .on(
        table.workspaceId,
        table.recipientKind,
        sql`coalesce(${table.recipientId}, '')`,
        table.recordedAt,
        sql`${table.id} COLLATE "C"`,
      )
      .where(sql`${table.state} = 'Pending'`),
    check(
      "notification_thread",
      sql`(${table.threadId} IS NULL AND ${table.threadGroupId} IS NULL AND ${table.threadSequence} IS NULL) OR (${table.threadId} IS NOT NULL AND ${table.threadGroupId} IS NOT NULL AND ${table.threadSequence} > 0)`,
    ),
    // A reader's pending notifications per group, counted for their sidebar.
    index("pending_notifications_by_group")
      .on(
        table.workspaceId,
        table.recipientKind,
        sql`coalesce(${table.recipientId}, '')`,
        table.threadGroupId,
      )
      .where(sql`${table.state} = 'Pending'`),
    // A reader's pending notifications from one thread, settled when they read it.
    index("pending_notifications_by_thread")
      .on(
        table.workspaceId,
        table.recipientKind,
        sql`coalesce(${table.recipientId}, '')`,
        table.threadId,
        table.threadSequence,
      )
      .where(sql`${table.state} = 'Pending'`),
    check(
      "notifications_recipient_kind",
      sql`(${table.recipientKind} = 'Triage' AND ${table.recipientId} IS NULL) OR (${table.recipientKind} IN ('Human', 'Agent', 'Contact') AND ${table.recipientId} IS NOT NULL AND ${table.recipientId} <> '')`,
    ),
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
    subject: text("subject"),
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
    // Appends and keyed receipts address an open or committed batch by its commit.
    index("log_entries_by_commit").on(
      table.workspaceId,
      table.logId,
      table.commitId,
      table.entryIndex,
    ),
    index("log_entries_by_subject").on(
      table.workspaceId,
      table.logId,
      table.subject,
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
      sql`(${table.subject} IS NULL AND ${table.factName} IS NULL AND ${table.factVersion} IS NULL AND ${table.performerKind} IS NULL) OR (${table.subject} IS NOT NULL AND ${table.factName} IS NOT NULL AND ${table.factVersion} IS NOT NULL AND ${table.performerKind} IS NOT NULL)`,
    ),
    check(
      "log_entries_provenance",
      sql`(${table.performerKind} IS NULL AND ${table.performerMemberId} IS NULL AND ${table.performerIdentityKind} IS NULL AND ${table.performerIdentityId} IS NULL AND ${table.performerSystemId} IS NULL AND ${table.correlationId} IS NULL AND ${table.occurredAt} IS NULL AND ${table.causeLogId} IS NULL AND ${table.causeCommitId} IS NULL AND ${table.causeEntryId} IS NULL) OR (${table.performerKind} IS NOT NULL AND ${table.correlationId} IS NOT NULL AND ${table.occurredAt} IS NOT NULL AND ((${table.performerKind} = 'Member' AND ${table.performerMemberId} IS NOT NULL AND ${table.performerIdentityKind} IN ('Human', 'Agent') AND ${table.performerIdentityKind} IS NOT NULL AND ${table.performerIdentityId} IS NOT NULL AND ${table.performerSystemId} IS NULL) OR (${table.performerKind} = 'Identity' AND ${table.performerMemberId} IS NULL AND ${table.performerIdentityKind} IN ('Human', 'Agent', 'Contact') AND ${table.performerIdentityKind} IS NOT NULL AND ${table.performerIdentityId} IS NOT NULL AND ${table.performerSystemId} IS NULL) OR (${table.performerKind} = 'System' AND ${table.performerMemberId} IS NULL AND ${table.performerIdentityKind} IS NULL AND ${table.performerIdentityId} IS NULL AND ${table.performerSystemId} IS NOT NULL)))`,
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

/** The projection versions every commit to a log applies: at most one version per name. */
export const liveProjections = pgTable(
  "live_projections",
  {
    workspaceId: text("workspace_id").notNull(),
    logId: text("log_id").notNull(),
    name: text("name").notNull(),
    version: doublePrecision("version").notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.logId, table.name] })],
);

export const threads = pgTable(
  "threads",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    groupId: text("group_id").notNull(),
    // A member starts a conversation in the app; a contact starts one a channel receives.
    createdByKind: text("created_by_kind", { enum: ["Member", "Contact"] }).notNull(),
    createdByMemberId: text("created_by_member_id"),
    createdByContactId: text("created_by_contact_id"),
    createdAt: instant("created_at").notNull(),
    // The thread's latest content activity, maintained from its timeline.
    latestSequence: integer("latest_sequence"),
    latestActivityAt: instant("latest_activity_at"),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    foreignKey({
      columns: [t.workspaceId, t.groupId],
      foreignColumns: [groups.workspaceId, groups.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.createdByMemberId],
      foreignColumns: [members.workspaceId, members.id],
    }),
    check(
      "thread_creator",
      sql`(${t.createdByKind} = 'Member' AND ${t.createdByMemberId} IS NOT NULL AND ${t.createdByContactId} IS NULL) OR (${t.createdByKind} = 'Contact' AND ${t.createdByMemberId} IS NULL AND ${t.createdByContactId} IS NOT NULL)`,
    ),
    index("threads_by_group").on(t.workspaceId, t.groupId, sql`${t.id} COLLATE "C"`),
    // A group's threads by latest activity, newest first.
    index("threads_by_latest").on(
      t.workspaceId,
      t.groupId,
      t.latestActivityAt,
      sql`${t.id} COLLATE "C"`,
    ),
    check(
      "thread_latest",
      sql`(${t.latestSequence} IS NULL AND ${t.latestActivityAt} IS NULL) OR (${t.latestSequence} > 0 AND ${t.latestActivityAt} IS NOT NULL)`,
    ),
  ],
);
/**
 * Private read state, outside the journal. It references no projection tables, so rebuilding
 * projections from the journal leaves it intact.
 */
export const threadReadPositions = pgTable(
  "thread_read_positions",
  {
    workspaceId: text("workspace_id").notNull(),
    memberId: text("member_id").notNull(),
    threadId: text("thread_id").notNull(),
    readThrough: integer("read_through").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.memberId, t.threadId] }),
    check("thread_read_position", sql`${t.readThrough} > 0`),
  ],
);
export const groupReadTimes = pgTable(
  "group_read_times",
  {
    workspaceId: text("workspace_id").notNull(),
    memberId: text("member_id").notNull(),
    groupId: text("group_id").notNull(),
    caughtUpAt: instant("caught_up_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.memberId, t.groupId] })],
);
export const threadParticipations = pgTable(
  "thread_participations",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    threadId: text("thread_id").notNull(),
    // Members carry their admission and identity; contacts their contact ID; triage neither.
    participantKind: text("participant_kind", { enum: participantKinds }).notNull(),
    memberId: text("member_id"),
    groupMembershipId: text("group_membership_id"),
    identityKind: text("identity_kind", { enum: identityKinds }),
    identityId: text("identity_id"),
    joinedAt: instant("joined_at").notNull(),
    joinedAtSequence: integer("joined_at_sequence").notNull(),
    status: text("status", { enum: ["active", "ended"] }).notNull(),
    endedAt: instant("ended_at"),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    foreignKey({
      columns: [t.workspaceId, t.threadId],
      foreignColumns: [threads.workspaceId, threads.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.memberId],
      foreignColumns: [members.workspaceId, members.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.groupMembershipId],
      foreignColumns: [groupMemberships.workspaceId, groupMemberships.id],
    }),
    uniqueIndex("active_thread_participation")
      .on(
        t.workspaceId,
        t.threadId,
        t.participantKind,
        sql`coalesce(${t.memberId}, ${t.identityId}, '')`,
      )
      .where(sql`${t.status} = 'active'`),
    check(
      "participation_participant",
      sql`(${t.participantKind} = 'Member' AND ${t.memberId} IS NOT NULL AND ${t.groupMembershipId} IS NOT NULL AND ${t.identityKind} IN ('Human', 'Agent') AND ${t.identityId} IS NOT NULL) OR (${t.participantKind} = 'Contact' AND ${t.memberId} IS NULL AND ${t.groupMembershipId} IS NULL AND ${t.identityKind} = 'Contact' AND ${t.identityId} IS NOT NULL) OR (${t.participantKind} = 'Triage' AND ${t.memberId} IS NULL AND ${t.groupMembershipId} IS NULL AND ${t.identityKind} IS NULL AND ${t.identityId} IS NULL)`,
    ),
    index("participations_by_thread").on(t.workspaceId, t.threadId, sql`${t.id} COLLATE "C"`),
    index("participations_by_admission").on(
      t.workspaceId,
      t.groupMembershipId,
      sql`${t.id} COLLATE "C"`,
    ),
    check(
      "participation_state",
      sql`(${t.status} = 'active' AND ${t.endedAt} IS NULL) OR (${t.status} = 'ended' AND ${t.endedAt} IS NOT NULL)`,
    ),
    check("participation_sequence", sql`${t.joinedAtSequence} > 0`),
  ],
);
export const threadMessages = pgTable(
  "thread_messages",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    threadId: text("thread_id").notNull(),
    // Members author in the app; contacts author what a channel receives.
    authorKind: text("author_kind", { enum: ["Member", "Contact"] }).notNull(),
    authorMemberId: text("author_member_id"),
    authorContactId: text("author_contact_id"),
    kind: text("kind", { enum: ["User"] }).notNull(),
    text: text("text").notNull(),
    mentions: text("mentions").array().notNull(),
    publishedAt: instant("published_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    foreignKey({
      columns: [t.workspaceId, t.threadId],
      foreignColumns: [threads.workspaceId, threads.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.authorMemberId],
      foreignColumns: [members.workspaceId, members.id],
    }),
    check(
      "thread_message_author",
      sql`(${t.authorKind} = 'Member' AND ${t.authorMemberId} IS NOT NULL AND ${t.authorContactId} IS NULL) OR (${t.authorKind} = 'Contact' AND ${t.authorMemberId} IS NULL AND ${t.authorContactId} IS NOT NULL)`,
    ),
  ],
);
/**
 * Core validates each activity kind. The table keeps typed references with their keys and
 * uniqueness, so a new kind adds nullable reference columns rather than rewriting a constraint.
 */
export const threadActivities = pgTable(
  "thread_activities",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    threadId: text("thread_id").notNull(),
    sequence: integer("sequence").notNull(),
    kind: text("kind", {
      enum: ["MessagePublished", "ParticipationFollowed", "ParticipationEnded"],
    }).notNull(),
    messageId: text("message_id"),
    participationId: text("participation_id"),
    reason: text("reason", {
      enum: ["unfollowed", "group-left", "group-removed", "workspace-removed"],
    }),
    occurredAt: instant("occurred_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    foreignKey({
      columns: [t.workspaceId, t.threadId],
      foreignColumns: [threads.workspaceId, threads.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.messageId],
      foreignColumns: [threadMessages.workspaceId, threadMessages.id],
    }),
    uniqueIndex("thread_activity_sequence").on(t.workspaceId, t.threadId, t.sequence),
    uniqueIndex("thread_message_activity").on(t.workspaceId, t.messageId),
    foreignKey({
      columns: [t.workspaceId, t.participationId],
      foreignColumns: [threadParticipations.workspaceId, threadParticipations.id],
    }),
    uniqueIndex("thread_participation_activity").on(t.workspaceId, t.participationId, t.kind),
    check("thread_activity_positive_sequence", sql`${t.sequence} > 0`),
  ],
);
