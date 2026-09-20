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
ALTER TABLE "log_append_keys" ADD CONSTRAINT "log_append_keys_batch" FOREIGN KEY ("workspace_id","log_id","commit_id") REFERENCES "log_batches"("workspace_id","log_id","commit_id");