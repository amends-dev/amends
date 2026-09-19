CREATE TABLE "notifications" (
	"workspace_id" text,
	"id" text,
	"source_log_id" text NOT NULL,
	"source_entry_id" text NOT NULL,
	"recipient_kind" text NOT NULL,
	"recipient_id" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "notifications_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "notifications_recipient_kind" CHECK ("recipient_kind" IN ('Human', 'Agent')),
	CONSTRAINT "notifications_state" CHECK ("state" = 'Pending')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_by_source_recipient" ON "notifications" ("workspace_id","source_log_id","source_entry_id","recipient_kind","recipient_id");--> statement-breakpoint
CREATE INDEX "notifications_by_recipient" ON "notifications" ("workspace_id","recipient_kind","recipient_id","recorded_at","id" COLLATE "C");--> statement-breakpoint
CREATE INDEX "pending_notifications_by_recipient" ON "notifications" ("workspace_id","recipient_kind","recipient_id","recorded_at","id" COLLATE "C") WHERE "state" = 'Pending';--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("workspace_id") ON DELETE CASCADE;