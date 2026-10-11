/**
 * Core's records as relational tables. Every table leads its primary key with
 * the workspace, and every reference between tables carries the workspace, so
 * a join that starts scoped stays scoped. Tagged unions become a discriminator
 * column plus the columns each case needs, constrained to agree.
 *
 * Projection tables have no foreign keys to one another: each read model rebuilds alone, in any
 * order, and core checks references when it publishes the facts they come from. The log's own
 * tables keep theirs.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
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
export const taskStatuses = ["triage", "todo", "doing", "held", "done", "dismissed"] as const;
export const taskPriorities = ["none", "low", "medium", "high", "urgent"] as const;
export const assignmentStatuses = ["active", "revoked"] as const;
export const sourceKinds = ["Role", "Direct"] as const;
export const scopeKinds = ["Workspace", "Target"] as const;
export const targetKinds = [
  "Workspace",
  "Member",
  "Thread",
  "Group",
  "Connection",
  "Channel",
] as const;
export const deliveryStatuses = ["requested", "sent", "failed"] as const;
export const invitationStates = ["Pending", "Accepted", "Revoked"] as const;
/** A notification's state; a human recipient's Seen is also kept in notification_seen. */
export const notificationStates = [
  "Pending",
  "Seen",
  "Accepted",
  "Discarded",
  "Informational",
] as const;

/** A grant's scope: the whole workspace, or one exact target within it. The workspace is the row's. */
const scopeColumns = {
  scopeKind: text("scope_kind", { enum: scopeKinds }).notNull(),
  targetKind: text("target_kind", { enum: targetKinds }),
  targetMemberId: text("target_member_id"),
  targetThreadId: text("target_thread_id"),
  targetGroupId: text("target_group_id"),
  targetConnectionId: text("target_connection_id"),
  targetChannelId: text("target_channel_id"),
};
/** The column holding each kind of target's ID; a workspace target needs none. */
const targetIds = {
  Member: "targetMemberId",
  Thread: "targetThreadId",
  Group: "targetGroupId",
  Connection: "targetConnectionId",
  Channel: "targetChannelId",
} as const;
const scopeAgrees = (name: string, columns: Record<keyof typeof scopeColumns, AnyPgColumn>) => {
  /** Only the named target ID column is set, or none. */
  const only = (kept?: (typeof targetIds)[keyof typeof targetIds]) =>
    sql.join(
      Object.values(targetIds).map((column) =>
        column === kept ? sql`${columns[column]} IS NOT NULL` : sql`${columns[column]} IS NULL`,
      ),
      sql` AND `,
    );
  return check(
    name,
    sql`(${columns.scopeKind} = 'Workspace' AND ${columns.targetKind} IS NULL AND ${only()}) OR (${columns.scopeKind} = 'Target' AND ${columns.targetKind} IS NOT NULL AND ((${columns.targetKind} = 'Workspace' AND ${only()}) OR ${sql.join(
      Object.entries(targetIds).map(
        ([kind, column]) =>
          sql`(${columns.targetKind} = ${sql.raw(`'${kind}'`)} AND ${only(column)})`,
      ),
      sql` OR `,
    )}))`,
  );
};

export const workspaces = pgTable("workspaces", {
  name: text("name").notNull(),
  workspaceId: text("workspace_id").primaryKey(),
  createdBy: text("created_by").notNull(),
  ownerMemberId: text("owner_member_id").notNull(),
});

export const members = pgTable(
  "members",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    identityKind: text("identity_kind", { enum: memberIdentityKinds }).notNull(),
    identityId: text("identity_id").notNull(),
    // What the member chose to be called in this workspace, when they have.
    name: text("name"),
    status: text("status", { enum: memberStatuses }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
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
    visibility: text("visibility", { enum: ["Private", "Public"] }),
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
    check(
      "groups_kind",
      sql`(${table.kind} = 'Team' AND ${table.visibility} IN ('Private', 'Public') AND ${table.name} IS NOT NULL AND ${table.memberIds} IS NULL AND ${table.directKey} IS NULL) OR (${table.kind} = 'Direct' AND ${table.visibility} IS NULL AND ${table.name} IS NULL AND cardinality(${table.memberIds}) >= 2 AND ${table.directKey} IS NOT NULL)`,
    ),
    // The workspace's public groups, paged in group-ID order for browsing.
    index("public_groups")
      .on(table.workspaceId, sql`${table.id} COLLATE "C"`)
      .where(sql`${table.visibility} = 'Public'`),
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
  (table) => [primaryKey({ columns: [table.workspaceId, table.id] })],
);

/** The built-in bundle revision a workspace's roles hold, which only moves forward. */
export const builtinRoleRevisions = pgTable(
  "builtin_role_revisions",
  {
    workspaceId: text("workspace_id").primaryKey(),
    revision: integer("revision").notNull(),
  },
  (table) => [check("builtin_role_revision_positive", sql`${table.revision} > 0`)],
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
    discardReason: text("discard_reason", { enum: ["participation-ended", "access-lost"] }),
    // What accepted the notification, and when: an agent's turn, or a delivery to a contact.
    acceptedByKind: text("accepted_by_kind", { enum: ["Turn", "Delivery"] }),
    acceptedTurnId: text("accepted_turn_id"),
    acceptedDeliveryId: text("accepted_delivery_id"),
    acceptedAt: instant("accepted_at"),
    recipientKind: text("recipient_kind", { enum: recipientKinds }).notNull(),
    recipientId: text("recipient_id"),
    // The membership a human or agent is notified as; its inbox is the membership's.
    recipientMemberId: text("recipient_member_id"),
    recordedAt: instant("recorded_at").notNull(),
    state: text("state", { enum: notificationStates }).notNull(),
    // When a human saw it: a copy of notification_seen, which keeps it across rebuilds.
    seenAt: instant("seen_at"),
    // The thread, its group, and the timeline position of thread-activity notifications.
    threadId: text("thread_id"),
    threadGroupId: text("thread_group_id"),
    threadSequence: integer("thread_sequence"),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    // Each state holds its own columns and no other's.
    check(
      "notification_state",
      sql`(${table.discardReason} IS NOT NULL) = (${table.state} = 'Discarded') AND (${table.acceptedByKind} IS NOT NULL AND ${table.acceptedAt} IS NOT NULL) = (${table.state} = 'Accepted') AND (${table.acceptedByKind} IS NULL) = (${table.acceptedAt} IS NULL) AND (${table.acceptedTurnId} IS NOT NULL) = (${table.acceptedByKind} IS NOT DISTINCT FROM 'Turn') AND (${table.acceptedDeliveryId} IS NOT NULL) = (${table.acceptedByKind} IS NOT DISTINCT FROM 'Delivery') AND (${table.acceptedByKind} IS DISTINCT FROM 'Turn' OR ${table.recipientKind} = 'Agent') AND (${table.acceptedByKind} IS DISTINCT FROM 'Delivery' OR ${table.recipientKind} = 'Contact') AND (${table.seenAt} IS NOT NULL) = (${table.state} = 'Seen') AND (${table.state} <> 'Seen' OR ${table.recipientKind} = 'Human')`,
    ),
    check(
      "notification_recipient",
      sql`CASE ${table.recipientKind} WHEN 'Triage' THEN ${table.recipientId} IS NULL AND ${table.recipientMemberId} IS NULL WHEN 'Contact' THEN ${table.recipientId} IS NOT NULL AND ${table.recipientMemberId} IS NULL ELSE ${table.recipientId} IS NOT NULL AND ${table.recipientMemberId} IS NOT NULL END`,
    ),
    // Source existence and recipient selection belong to notification generation.
    uniqueIndex("notifications_by_source_recipient").on(
      table.workspaceId,
      table.sourceLogId,
      table.sourceEntryId,
      table.recipientKind,
      sql`coalesce(${table.recipientId}, '')`,
    ),
    // Inboxes: a membership's for people and agents, a contact's, or triage's.
    index("notifications_by_recipient").on(
      table.workspaceId,
      table.recipientKind,
      sql`coalesce(${table.recipientMemberId}, ${table.recipientId}, '')`,
      table.recordedAt,
      sql`${table.id} COLLATE "C"`,
    ),
    index("pending_notifications_by_recipient")
      .on(
        table.workspaceId,
        table.recipientKind,
        sql`coalesce(${table.recipientMemberId}, ${table.recipientId}, '')`,
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
        sql`coalesce(${table.recipientMemberId}, ${table.recipientId}, '')`,
        table.threadGroupId,
      )
      .where(sql`${table.state} = 'Pending'`),
    // A reader's notifications from one thread by position: what they were told there, and the
    // pending ones settled when they read it.
    index("notifications_by_thread").on(
      table.workspaceId,
      table.recipientKind,
      sql`coalesce(${table.recipientMemberId}, ${table.recipientId}, '')`,
      table.threadId,
      table.threadSequence,
      sql`${table.id} COLLATE "C"`,
    ),
    // An ended participation's pending agent input, settled in the commit that ends it.
    index("pending_agent_notifications_by_participation")
      .on(table.workspaceId, table.participationId)
      .where(sql`${table.state} = 'Pending' AND ${table.recipientKind} = 'Agent'`),
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
    // The thread's own title, when it has one, and the thread it was derived from, if any.
    title: text("title"),
    origin: text("origin"),
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
    check(
      "thread_creator",
      sql`(${t.createdByKind} = 'Member' AND ${t.createdByMemberId} IS NOT NULL AND ${t.createdByContactId} IS NULL) OR (${t.createdByKind} = 'Contact' AND ${t.createdByMemberId} IS NULL AND ${t.createdByContactId} IS NOT NULL)`,
    ),
    index("threads_by_group").on(t.workspaceId, t.groupId, sql`${t.id} COLLATE "C"`),
    // A group's threads by when they started, newest first.
    index("threads_by_start").on(t.workspaceId, t.groupId, t.createdAt, sql`${t.id} COLLATE "C"`),
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
/**
 * When a human recipient first saw each notification: private state outside the journal, kept
 * when projections are rebuilt, so it references notifications by ID without a foreign key.
 */
export const notificationSeen = pgTable(
  "notification_seen",
  {
    workspaceId: text("workspace_id").notNull(),
    notificationId: text("notification_id").notNull(),
    seenAt: instant("seen_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.notificationId] })],
);
export const groupReadTimes = pgTable(
  "group_read_times",
  {
    workspaceId: text("workspace_id").notNull(),
    memberId: text("member_id").notNull(),
    groupId: text("group_id").notNull(),
    readAt: instant("read_at").notNull(),
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
    // A thread's current participants, paged in participation-ID order.
    index("active_participations_by_thread")
      .on(t.workspaceId, t.threadId, sql`${t.id} COLLATE "C"`)
      .where(sql`${t.status} = 'active'`),
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
    // How it came about: an agent's turn, a channel's message, or null for one written in amends.
    viaKind: text("via_kind", { enum: ["Turn", "Channel"] }),
    turnId: text("turn_id"),
    channelId: text("channel_id"),
    externalMessageId: text("external_message_id"),
    publishedAt: instant("published_at").notNull(),
    // Its content: text and mentions at a revision, as last edited, or its deletion.
    contentKind: text("content_kind", { enum: ["Text", "Deleted"] }).notNull(),
    text: text("text"),
    mentions: text("mentions").array(),
    revision: integer("revision"),
    editedAt: instant("edited_at"),
    deletedAt: instant("deleted_at"),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    check(
      "thread_message_author",
      sql`(${t.authorKind} = 'Member' AND ${t.authorMemberId} IS NOT NULL AND ${t.authorContactId} IS NULL) OR (${t.authorKind} = 'Contact' AND ${t.authorMemberId} IS NULL AND ${t.authorContactId} IS NOT NULL)`,
    ),
    check(
      "thread_message_via",
      sql`(${t.viaKind} IS NULL AND ${t.turnId} IS NULL AND ${t.channelId} IS NULL AND ${t.externalMessageId} IS NULL) OR (${t.viaKind} = 'Turn' AND ${t.turnId} IS NOT NULL AND ${t.channelId} IS NULL AND ${t.externalMessageId} IS NULL) OR (${t.viaKind} = 'Channel' AND ${t.turnId} IS NULL AND ${t.channelId} IS NOT NULL AND ${t.externalMessageId} IS NOT NULL)`,
    ),
    check(
      "thread_message_content",
      sql`(${t.contentKind} = 'Text' AND ${t.text} IS NOT NULL AND ${t.mentions} IS NOT NULL AND ${t.revision} > 0 AND ${t.deletedAt} IS NULL) OR (${t.contentKind} = 'Deleted' AND ${t.text} IS NULL AND ${t.mentions} IS NULL AND ${t.revision} IS NULL AND ${t.editedAt} IS NULL AND ${t.deletedAt} IS NOT NULL)`,
    ),
    // A thread's messages that still have text, counted per thread for reply counts.
    index("thread_messages_by_thread")
      .on(t.workspaceId, t.threadId)
      .where(sql`${t.contentKind} = 'Text'`),
  ],
);
/** A thread's task: its current status, priority, and assignee. A thread has at most one, keyed by it. */
export const tasks = pgTable(
  "tasks",
  {
    workspaceId: text("workspace_id").notNull(),
    threadId: text("thread_id").notNull(),
    groupId: text("group_id").notNull(),
    status: text("status", { enum: taskStatuses }).notNull(),
    priority: text("priority", { enum: taskPriorities }).notNull(),
    assignee: text("assignee"),
    // A member creates a task in the app; a contact's conversation opens one through a channel.
    createdByKind: text("created_by_kind", { enum: ["Member", "Contact"] }).notNull(),
    createdByMemberId: text("created_by_member_id"),
    createdByContactId: text("created_by_contact_id"),
    createdAt: instant("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.threadId] }),
    check(
      "task_creator",
      sql`(${t.createdByKind} = 'Member' AND ${t.createdByMemberId} IS NOT NULL AND ${t.createdByContactId} IS NULL) OR (${t.createdByKind} = 'Contact' AND ${t.createdByMemberId} IS NULL AND ${t.createdByContactId} IS NOT NULL)`,
    ),
    // A group's tasks by when they were created, newest first.
    index("tasks_by_group").on(
      t.workspaceId,
      t.groupId,
      t.createdAt,
      sql`${t.threadId} COLLATE "C"`,
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
    // Every kind shares these columns; its definition in core reads `details`, the change the
    // activity reports, at the kind's version, so a new kind or version needs no schema change.
    kind: text("kind").notNull(),
    version: integer("version").notNull(),
    subject: text("subject").notNull(),
    occurrence: text("occurrence"),
    newActivity: boolean("new_activity").notNull(),
    details: jsonb("details").$type<unknown>().notNull(),
    occurredAt: instant("occurred_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    uniqueIndex("thread_activity_sequence").on(t.workspaceId, t.threadId, t.sequence),
    // At most one activity per occurrence key; activities without one are repeatable.
    uniqueIndex("thread_activity_occurrence").on(t.workspaceId, t.occurrence),
    check("thread_activity_positive_sequence", sql`${t.sequence} > 0`),
    check("thread_activity_positive_version", sql`${t.version} > 0`),
  ],
);

/**
 * Workspaces' connections to the integrations their host installs. An integration declares its own
 * settings, so they are stored as JSON, like a thread activity's kind-specific details; a
 * connection's credential is kept in connection_credentials.
 */
export const connections = pgTable(
  "connections",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    integration: text("integration").notNull(),
    name: text("name").notNull(),
    settings: jsonb("settings").$type<Record<string, string | number | boolean>>().notNull(),
    auth: text("auth", { enum: ["apiKey", "none"] }).notNull(),
    status: text("status", { enum: memberStatuses }).notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: instant("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
);

/** A channel: one connection's conversations, which become threads in one group. */
export const channels = pgTable(
  "channels",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    connectionId: text("connection_id").notNull(),
    groupId: text("group_id").notNull(),
    name: text("name").notNull(),
    // Whether a new conversation opens as a task in triage, or as a conversation alone.
    opensTasks: boolean("opens_tasks").notNull(),
    status: text("status", { enum: memberStatuses }).notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: instant("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
);

/**
 * A thread's external conversation: which channel it came through, and the conversation as the
 * channel's transport identifies it, with what the transport needs to post there. Each conversation
 * binds one thread.
 */
export const channelBindings = pgTable(
  "channel_bindings",
  {
    workspaceId: text("workspace_id").notNull(),
    threadId: text("thread_id").notNull(),
    channelId: text("channel_id").notNull(),
    groupId: text("group_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    conversationDetails: jsonb("conversation_details").$type<Record<string, unknown>>().notNull(),
    boundAt: instant("bound_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.threadId] }),
    uniqueIndex("channel_bindings_by_conversation").on(
      t.workspaceId,
      t.channelId,
      t.conversationId,
    ),
  ],
);

/** A person outside the workspace who writes through a channel, named as the channel knows them. */
export const contacts = pgTable(
  "contacts",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    channelId: text("channel_id").notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    createdAt: instant("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
);

/**
 * A message's delivery to a bound thread's conversation: requested when the delivery job accepts
 * the contacts' notifications of it, then sent, with the id the external system gave it, or failed.
 */
export const channelDeliveries = pgTable(
  "channel_deliveries",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    channelId: text("channel_id").notNull(),
    threadId: text("thread_id").notNull(),
    groupId: text("group_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    messageId: text("message_id").notNull(),
    sequence: integer("sequence").notNull(),
    status: text("status", { enum: deliveryStatuses }).notNull(),
    externalMessageId: text("external_message_id"),
    attempts: integer("attempts").notNull(),
    failure: text("failure"),
    requestedAt: instant("requested_at").notNull(),
    finishedAt: instant("finished_at"),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    // Each status holds its own columns: sent has the external id, failed the reason, and both are finished.
    check(
      "channel_delivery_status",
      sql`(${t.status} = 'requested') = (${t.finishedAt} IS NULL) AND (${t.status} = 'sent') = (${t.externalMessageId} IS NOT NULL) AND (${t.status} = 'failed') = (${t.failure} IS NOT NULL) AND ${t.sequence} > 0 AND ${t.attempts} >= 0`,
    ),
    // A thread's deliveries still to send, in the order their messages were published.
    index("channel_deliveries_requested_by_thread")
      .on(t.workspaceId, t.threadId, t.sequence)
      .where(sql`${t.status} = 'requested'`),
    // The delivery that posted an external message, so that receiving it again is known as an echo.
    index("channel_deliveries_by_external_message").on(
      t.workspaceId,
      t.channelId,
      t.conversationId,
      t.externalMessageId,
    ),
  ],
);

/**
 * Each connection's credential, outside the journal and its read models: rebuilding projections
 * keeps them. Each is sealed with the host's credential key, bound to its workspace and connection.
 */
export const connectionCredentials = pgTable(
  "connection_credentials",
  {
    workspaceId: text("workspace_id").notNull(),
    connectionId: text("connection_id").notNull(),
    sealed: text("sealed").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.connectionId] })],
);

/**
 * Agents, each one workspace membership, which names it and holds its role. Its harness is a
 * connection's, or chosen among the workspace's when `harness_connection_id` is null; its model is
 * a connection's, by the provider's id, with an effort when one is set; and its sandbox a
 * connection's, or none.
 */
export const agents = pgTable(
  "agents",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    memberId: text("member_id").notNull(),
    instructions: text("instructions").notNull(),
    harnessConnectionId: text("harness_connection_id"),
    modelConnectionId: text("model_connection_id").notNull(),
    modelId: text("model_id").notNull(),
    modelEffort: text("model_effort"),
    sandboxConnectionId: text("sandbox_connection_id"),
    createdBy: text("created_by").notNull(),
    createdAt: instant("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    uniqueIndex("agents_by_member").on(t.workspaceId, t.memberId),
  ],
);

export const turnStatuses = [
  "queued",
  "running",
  "cancelling",
  "completed",
  "failed",
  "cancelled",
] as const;

/**
 * Agents' turns on threads, with how far into its thread each one's input reaches, and what it
 * started on: a harness, a model, and a sandbox or none, recorded when it starts, all together or
 * not at all. A retry names the turn it runs again and who asked, both or neither. An agent has at
 * most one active turn on a thread.
 */
export const turns = pgTable(
  "turns",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    groupId: text("group_id").notNull(),
    threadId: text("thread_id").notNull(),
    agentId: text("agent_id").notNull(),
    memberId: text("member_id").notNull(),
    participationId: text("participation_id").notNull(),
    retryOf: text("retry_of"),
    retriedBy: text("retried_by"),
    status: text("status", { enum: turnStatuses }).notNull(),
    acceptedThroughSequence: integer("accepted_through_sequence").notNull(),
    logAfter: integer("log_after").notNull(),
    harnessConnectionId: text("harness_connection_id"),
    modelConnectionId: text("model_connection_id"),
    modelId: text("model_id"),
    modelEffort: text("model_effort"),
    sandboxConnectionId: text("sandbox_connection_id"),
    messageIds: text("message_ids").array().notNull(),
    failure: text("failure"),
    cancelReason: text("cancel_reason", {
      enum: ["requested", "participation-ended", "task-changed"],
    }),
    createdAt: instant("created_at").notNull(),
    startedAt: instant("started_at"),
    finishedAt: instant("finished_at"),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    uniqueIndex("active_turn_by_agent_thread")
      .on(t.workspaceId, t.memberId, t.threadId)
      .where(sql`${t.status} IN ('queued', 'running', 'cancelling')`),
    index("turns_by_agent_thread").on(t.workspaceId, t.memberId, t.threadId, t.createdAt),
    index("active_turns")
      .on(t.workspaceId, t.createdAt)
      .where(sql`${t.status} IN ('queued', 'running', 'cancelling')`),
    check("turn_retry_complete", sql`(${t.retryOf} IS NULL) = (${t.retriedBy} IS NULL)`),
    check(
      "turn_selection_complete",
      sql`(${t.harnessConnectionId} IS NULL AND ${t.modelConnectionId} IS NULL AND ${t.modelId} IS NULL AND ${t.modelEffort} IS NULL AND ${t.sandboxConnectionId} IS NULL) OR (${t.harnessConnectionId} IS NOT NULL AND ${t.modelConnectionId} IS NOT NULL AND ${t.modelId} IS NOT NULL)`,
    ),
  ],
);

/**
 * Each participation's harness session as its last turn left it, beside its conversation, which
 * session_log_entries keeps; outside the journal and its read models, so rebuilding projections
 * keeps them. What the harness's agent returned is its own, so it is stored as JSON, and a row
 * without it has none.
 */
export const sessionStates = pgTable(
  "session_states",
  {
    workspaceId: text("workspace_id").notNull(),
    participationId: text("participation_id").notNull(),
    agent: text("agent").notNull(),
    agentState: jsonb("agent_state"),
    promptedThroughSequence: integer("prompted_through_sequence").notNull(),
    harnessConnectionId: text("harness_connection_id").notNull(),
    modelConnectionId: text("model_connection_id").notNull(),
    modelId: text("model_id").notNull(),
    modelEffort: text("model_effort"),
    sandboxConnectionId: text("sandbox_connection_id"),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.participationId] })],
);

/**
 * Each participation's session log, outside the journal and its commits: an append is a statement
 * of its own, and its key keeps a position from being taken twice. Every entry but the conversation
 * the agent joined names its turn, and keeps what its kind says in `details`, as a thread activity
 * does.
 */
export const sessionLogEntries = pgTable(
  "session_log_entries",
  {
    workspaceId: text("workspace_id").notNull(),
    participationId: text("participation_id").notNull(),
    position: integer("position").notNull(),
    recordedAt: instant("recorded_at").notNull(),
    kind: text("kind", {
      enum: ["Joined", "Prompted", "Started", "Step", "Interrupted"],
    }).notNull(),
    turnId: text("turn_id"),
    details: jsonb("details").$type<unknown>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.participationId, t.position] }),
    check("session_log_positive_position", sql`${t.position} > 0`),
    check("session_log_entry_turn", sql`(${t.kind} = 'Joined') = (${t.turnId} IS NULL)`),
  ],
);

/**
 * The people this host knows, across its workspaces: the one table not kept per workspace. An
 * address is held lowercase, so it is unique as written.
 */
export const accounts = pgTable("accounts", {
  humanId: text("human_id").primaryKey(),
  email: text("email").notNull().unique(),
});
