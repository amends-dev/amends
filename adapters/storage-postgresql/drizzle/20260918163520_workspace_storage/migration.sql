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
	CONSTRAINT "assignments_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "assignments_source_agrees" CHECK (("source_kind" = 'Role' AND "role_id" IS NOT NULL AND "permission" IS NULL) OR ("source_kind" = 'Direct' AND "permission" IS NOT NULL AND "role_id" IS NULL)),
	CONSTRAINT "assignments_scope_agrees" CHECK (("scope_kind" = 'Workspace' AND "target_kind" IS NULL AND "target_member_id" IS NULL) OR ("scope_kind" = 'Target' AND (("target_kind" = 'Workspace' AND "target_member_id" IS NULL) OR ("target_kind" = 'Member' AND "target_member_id" IS NOT NULL))))
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
CREATE TABLE "invitation_grants" (
	"workspace_id" text,
	"invitation_id" text,
	"position" integer,
	"permission" text NOT NULL,
	"scope_kind" text NOT NULL,
	"target_kind" text,
	"target_member_id" text,
	CONSTRAINT "invitation_grants_pkey" PRIMARY KEY("workspace_id","invitation_id","position"),
	CONSTRAINT "invitation_grants_scope_agrees" CHECK (("scope_kind" = 'Workspace' AND "target_kind" IS NULL AND "target_member_id" IS NULL) OR ("scope_kind" = 'Target' AND (("target_kind" = 'Workspace' AND "target_member_id" IS NULL) OR ("target_kind" = 'Member' AND "target_member_id" IS NOT NULL))))
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"workspace_id" text,
	"id" text,
	"recipient_id" text NOT NULL,
	"inviter_member_id" text NOT NULL,
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
	CONSTRAINT "log_entries_pkey" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"workspace_id" text,
	"id" text,
	"identity_kind" text NOT NULL,
	"identity_id" text NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "members_pkey" PRIMARY KEY("workspace_id","id")
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
	"workspace_id" text PRIMARY KEY,
	"created_by" text NOT NULL,
	"owner_member_id" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "assignments_by_member" ON "assignments" ("workspace_id","member_id","status");--> statement-breakpoint
CREATE INDEX "assignments_by_role" ON "assignments" ("workspace_id","role_id","status");--> statement-breakpoint
CREATE INDEX "invitations_by_recipient" ON "invitations" ("workspace_id","recipient_id","state");--> statement-breakpoint
CREATE INDEX "pending_invitations_by_recipient" ON "invitations" ("recipient_id") WHERE "state" = 'Pending';--> statement-breakpoint
CREATE UNIQUE INDEX "log_batches_by_commit" ON "log_batches" ("workspace_id","log_id","commit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "log_entries_by_position" ON "log_entries" ("workspace_id","log_id","position","entry_index");--> statement-breakpoint
CREATE UNIQUE INDEX "active_member_identity" ON "members" ("workspace_id","identity_kind","identity_id") WHERE "status" = 'active';--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_member" FOREIGN KEY ("workspace_id","member_id") REFERENCES "members"("workspace_id","id");--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_role" FOREIGN KEY ("workspace_id","role_id") REFERENCES "roles"("workspace_id","id");--> statement-breakpoint
ALTER TABLE "invitation_grants" ADD CONSTRAINT "invitation_grants_invitation" FOREIGN KEY ("workspace_id","invitation_id") REFERENCES "invitations"("workspace_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter" FOREIGN KEY ("workspace_id","inviter_member_id") REFERENCES "members"("workspace_id","id");--> statement-breakpoint
ALTER TABLE "log_batches" ADD CONSTRAINT "log_batches_commit" FOREIGN KEY ("workspace_id","commit_id") REFERENCES "commits"("workspace_id","id");--> statement-breakpoint
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_batch" FOREIGN KEY ("workspace_id","log_id","position") REFERENCES "log_batches"("workspace_id","log_id","position");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("workspace_id") ON DELETE CASCADE;