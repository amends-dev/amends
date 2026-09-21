CREATE TABLE "assignments" (
	"workspace_id" text,
	"id" text,
	"member_id" text NOT NULL,
	"status" text NOT NULL,
	"source_kind" text NOT NULL,
	"role_id" text,
	"permission" text,
	"scope_kind" text NOT NULL,
	"target_kind" text,
	"target_member_id" text,
	"target_thread_id" text,
	"target_group_id" text,
	CONSTRAINT "assignments_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "assignments_source_agrees" CHECK (("source_kind" = 'Role' AND "role_id" IS NOT NULL AND "permission" IS NULL) OR ("source_kind" = 'Direct' AND "permission" IS NOT NULL AND "role_id" IS NULL)),
	CONSTRAINT "assignments_scope_agrees" CHECK (("scope_kind" = 'Workspace' AND "target_kind" IS NULL AND "target_member_id" IS NULL AND "target_thread_id" IS NULL AND "target_group_id" IS NULL) OR ("scope_kind" = 'Target' AND "target_kind" IS NOT NULL AND (("target_kind" = 'Workspace' AND "target_member_id" IS NULL AND "target_thread_id" IS NULL AND "target_group_id" IS NULL) OR ("target_kind" = 'Member' AND "target_member_id" IS NOT NULL AND "target_thread_id" IS NULL AND "target_group_id" IS NULL) OR ("target_kind" = 'Thread' AND "target_thread_id" IS NOT NULL AND "target_member_id" IS NULL AND "target_group_id" IS NULL) OR ("target_kind" = 'Group' AND "target_group_id" IS NOT NULL AND "target_member_id" IS NULL AND "target_thread_id" IS NULL))))
);
--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"workspace_id" text,
	"log_id" text,
	"name" text,
	"version" double precision,
	"position" integer NOT NULL,
	"commit_id" text NOT NULL,
	"entry_index" integer NOT NULL,
	"entry_id" text NOT NULL,
	CONSTRAINT "checkpoints_pkey" PRIMARY KEY("workspace_id","log_id","name","version")
);
--> statement-breakpoint
CREATE TABLE "commits" (
	"workspace_id" text,
	"id" text,
	"recorded_at" timestamp with time zone NOT NULL,
	"entry_count" integer NOT NULL,
	CONSTRAINT "commits_pkey" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "group_memberships" (
	"workspace_id" text,
	"id" text,
	"group_id" text NOT NULL,
	"member_id" text NOT NULL,
	"admitted_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "group_memberships_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "group_memberships_status" CHECK ("status" IN ('active', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"workspace_id" text,
	"id" text,
	"kind" text NOT NULL,
	"visibility" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "groups_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "groups_kind" CHECK ("kind" = 'Team'),
	CONSTRAINT "groups_visibility" CHECK ("visibility" = 'Private')
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"workspace_id" text,
	"id" text,
	"recipient_id" text NOT NULL,
	"inviter_member_id" text NOT NULL,
	"role_id" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	"accepted_member_id" text,
	"accepted_at" timestamp with time zone,
	"revoked_by_member_id" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invitations_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "invitations_state_agrees" CHECK (("state" = 'Pending' AND "accepted_member_id" IS NULL AND "accepted_at" IS NULL AND "revoked_by_member_id" IS NULL AND "revoked_at" IS NULL) OR ("state" = 'Accepted' AND "accepted_member_id" IS NOT NULL AND "accepted_at" IS NOT NULL AND "revoked_by_member_id" IS NULL AND "revoked_at" IS NULL) OR ("state" = 'Revoked' AND "revoked_by_member_id" IS NOT NULL AND "revoked_at" IS NOT NULL AND "accepted_member_id" IS NULL AND "accepted_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "log_append_keys" (
	"workspace_id" text,
	"log_id" text,
	"idempotency_key" text,
	"commit_id" text NOT NULL,
	"first_index" integer NOT NULL,
	"entry_count" integer NOT NULL,
	CONSTRAINT "log_append_keys_pkey" PRIMARY KEY("workspace_id","log_id","idempotency_key"),
	CONSTRAINT "log_append_keys_first_index" CHECK ("first_index" >= 0),
	CONSTRAINT "log_append_keys_entry_count" CHECK ("entry_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "log_batches" (
	"workspace_id" text,
	"log_id" text,
	"position" integer,
	"commit_id" text NOT NULL,
	CONSTRAINT "log_batches_pkey" PRIMARY KEY("workspace_id","log_id","position")
);
--> statement-breakpoint
CREATE TABLE "log_entries" (
	"workspace_id" text,
	"id" text,
	"log_id" text NOT NULL,
	"position" integer NOT NULL,
	"commit_id" text NOT NULL,
	"entry_index" integer NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"payload" bytea NOT NULL,
	"subject" text,
	"fact_name" text,
	"fact_version" double precision,
	"performer_kind" text,
	"performer_member_id" text,
	"performer_identity_kind" text,
	"performer_identity_id" text,
	"performer_system_id" text,
	"cause_log_id" text,
	"cause_commit_id" text,
	"cause_entry_id" text,
	"correlation_id" text,
	"occurred_at" timestamp with time zone,
	CONSTRAINT "log_entries_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "log_entries_fact_header" CHECK (("subject" IS NULL AND "fact_name" IS NULL AND "fact_version" IS NULL AND "performer_kind" IS NULL) OR ("subject" IS NOT NULL AND "fact_name" IS NOT NULL AND "fact_version" IS NOT NULL AND "performer_kind" IS NOT NULL)),
	CONSTRAINT "log_entries_provenance" CHECK (("performer_kind" IS NULL AND "performer_member_id" IS NULL AND "performer_identity_kind" IS NULL AND "performer_identity_id" IS NULL AND "performer_system_id" IS NULL AND "correlation_id" IS NULL AND "occurred_at" IS NULL AND "cause_log_id" IS NULL AND "cause_commit_id" IS NULL AND "cause_entry_id" IS NULL) OR ("performer_kind" IS NOT NULL AND "correlation_id" IS NOT NULL AND "occurred_at" IS NOT NULL AND (("performer_kind" = 'Member' AND "performer_member_id" IS NOT NULL AND "performer_identity_kind" IN ('Human', 'Agent') AND "performer_identity_kind" IS NOT NULL AND "performer_identity_id" IS NOT NULL AND "performer_system_id" IS NULL) OR ("performer_kind" = 'Identity' AND "performer_member_id" IS NULL AND "performer_identity_kind" IN ('Human', 'Agent', 'Contact') AND "performer_identity_kind" IS NOT NULL AND "performer_identity_id" IS NOT NULL AND "performer_system_id" IS NULL) OR ("performer_kind" = 'System' AND "performer_member_id" IS NULL AND "performer_identity_kind" IS NULL AND "performer_identity_id" IS NULL AND "performer_system_id" IS NOT NULL)))),
	CONSTRAINT "log_entries_cause" CHECK (("cause_log_id" IS NULL AND "cause_commit_id" IS NULL AND "cause_entry_id" IS NULL) OR ("cause_log_id" IS NOT NULL AND "cause_commit_id" IS NOT NULL AND "cause_entry_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "members" (
	"workspace_id" text,
	"id" text,
	"identity_kind" text NOT NULL,
	"identity_id" text NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "members_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "members_identity_kind" CHECK ("identity_kind" IN ('Human', 'Agent'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"workspace_id" text,
	"id" text,
	"source_log_id" text NOT NULL,
	"source_entry_id" text NOT NULL,
	"recipient_kind" text NOT NULL,
	"recipient_id" text,
	"recorded_at" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "notifications_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "notifications_recipient_kind" CHECK (("recipient_kind" = 'Triage' AND "recipient_id" IS NULL) OR ("recipient_kind" IN ('Human', 'Agent', 'Contact') AND "recipient_id" IS NOT NULL AND "recipient_id" <> '')),
	CONSTRAINT "notifications_state" CHECK ("state" = 'Pending')
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"workspace_id" text,
	"id" text,
	"name" text NOT NULL,
	"permissions" text[] NOT NULL,
	CONSTRAINT "roles_pkey" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"name" text NOT NULL,
	"workspace_id" text PRIMARY KEY,
	"created_by" text NOT NULL,
	"owner_member_id" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "assignments_by_member" ON "assignments" ("workspace_id","member_id","status");--> statement-breakpoint
CREATE INDEX "assignments_by_role" ON "assignments" ("workspace_id","role_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "active_group_membership" ON "group_memberships" ("workspace_id","group_id","member_id") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "group_memberships_by_group" ON "group_memberships" ("workspace_id","group_id","id" COLLATE "C");--> statement-breakpoint
CREATE INDEX "invitations_by_recipient" ON "invitations" ("workspace_id","recipient_id","state");--> statement-breakpoint
CREATE INDEX "pending_invitations_by_recipient" ON "invitations" ("recipient_id") WHERE "state" = 'Pending';--> statement-breakpoint
CREATE UNIQUE INDEX "log_batches_by_commit" ON "log_batches" ("workspace_id","log_id","commit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "log_entries_by_position" ON "log_entries" ("workspace_id","log_id","position","entry_index");--> statement-breakpoint
CREATE INDEX "log_entries_by_subject" ON "log_entries" ("workspace_id","log_id","subject","position","entry_index");--> statement-breakpoint
CREATE INDEX "log_entries_by_fact" ON "log_entries" ("workspace_id","log_id","fact_name","position","entry_index");--> statement-breakpoint
CREATE UNIQUE INDEX "active_member_identity" ON "members" ("workspace_id","identity_kind","identity_id") WHERE "status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_by_source_recipient" ON "notifications" ("workspace_id","source_log_id","source_entry_id","recipient_kind",coalesce("recipient_id", ''));--> statement-breakpoint
CREATE INDEX "notifications_by_recipient" ON "notifications" ("workspace_id","recipient_kind",coalesce("recipient_id", ''),"recorded_at","id" COLLATE "C");--> statement-breakpoint
CREATE INDEX "pending_notifications_by_recipient" ON "notifications" ("workspace_id","recipient_kind",coalesce("recipient_id", ''),"recorded_at","id" COLLATE "C") WHERE "state" = 'Pending';--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_member" FOREIGN KEY ("workspace_id","member_id") REFERENCES "members"("workspace_id","id");--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_role" FOREIGN KEY ("workspace_id","role_id") REFERENCES "roles"("workspace_id","id");--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group" FOREIGN KEY ("workspace_id","group_id") REFERENCES "groups"("workspace_id","id");--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_member" FOREIGN KEY ("workspace_id","member_id") REFERENCES "members"("workspace_id","id");--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_creator" FOREIGN KEY ("workspace_id","created_by") REFERENCES "members"("workspace_id","id");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter" FOREIGN KEY ("workspace_id","inviter_member_id") REFERENCES "members"("workspace_id","id");--> statement-breakpoint
ALTER TABLE "log_append_keys" ADD CONSTRAINT "log_append_keys_batch" FOREIGN KEY ("workspace_id","log_id","commit_id") REFERENCES "log_batches"("workspace_id","log_id","commit_id");--> statement-breakpoint
ALTER TABLE "log_batches" ADD CONSTRAINT "log_batches_commit" FOREIGN KEY ("workspace_id","commit_id") REFERENCES "commits"("workspace_id","id");--> statement-breakpoint
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_batch" FOREIGN KEY ("workspace_id","log_id","position") REFERENCES "log_batches"("workspace_id","log_id","position");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("workspace_id") ON DELETE CASCADE;