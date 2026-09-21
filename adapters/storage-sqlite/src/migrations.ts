import { SqliteMigrator } from "@effect/sql-sqlite-bun";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/** Fresh-database baseline. Local schema changes replace this baseline and reset development data. */
export const loader = SqliteMigrator.fromRecord({
  "0001_workspace_storage": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TABLE workspaces (workspace_id TEXT PRIMARY KEY, record TEXT NOT NULL CHECK(json_valid(record)))`;
    yield* sql`CREATE TABLE members (workspace_id TEXT NOT NULL, id TEXT NOT NULL, record TEXT NOT NULL CHECK(json_valid(record)), PRIMARY KEY(workspace_id, id))`;
    yield* sql`CREATE UNIQUE INDEX active_member_identity ON members(workspace_id, json_extract(record, '$.identity._tag'), json_extract(record, '$.identity.id')) WHERE json_extract(record, '$.status') = 'active'`;
    yield* sql`CREATE TABLE roles (workspace_id TEXT NOT NULL, id TEXT NOT NULL, record TEXT NOT NULL CHECK(json_valid(record)), PRIMARY KEY(workspace_id, id))`;
    yield* sql`CREATE TABLE assignments (workspace_id TEXT NOT NULL, id TEXT NOT NULL, record TEXT NOT NULL CHECK(json_valid(record)), PRIMARY KEY(workspace_id, id))`;
    yield* sql`CREATE INDEX assignments_by_member ON assignments(workspace_id, json_extract(record, '$.memberId'), json_extract(record, '$.status'))`;
    yield* sql`CREATE INDEX assignments_by_role ON assignments(workspace_id, json_extract(record, '$.source.roleId'), json_extract(record, '$.status'))`;
    yield* sql`CREATE TABLE commits (workspace_id TEXT NOT NULL, id TEXT NOT NULL, recorded_at TEXT NOT NULL, entry_count INTEGER NOT NULL, PRIMARY KEY(workspace_id, id))`;
    yield* sql`CREATE TABLE log_batches (workspace_id TEXT NOT NULL, log_id TEXT NOT NULL, position INTEGER NOT NULL, commit_id TEXT NOT NULL, PRIMARY KEY(workspace_id, log_id, position), UNIQUE(workspace_id, log_id, commit_id))`;
    yield* sql`CREATE TABLE log_entries (workspace_id TEXT NOT NULL, id TEXT NOT NULL, log_id TEXT NOT NULL, position INTEGER NOT NULL, commit_id TEXT NOT NULL, entry_index INTEGER NOT NULL, recorded_at TEXT NOT NULL, payload BLOB NOT NULL, subject TEXT, fact_name TEXT, fact_version REAL, provenance TEXT, CHECK((subject IS NULL AND fact_name IS NULL AND fact_version IS NULL AND provenance IS NULL) OR (subject IS NOT NULL AND fact_name IS NOT NULL AND fact_version IS NOT NULL AND provenance IS NOT NULL AND json_valid(provenance))), PRIMARY KEY(workspace_id, id), UNIQUE(workspace_id, log_id, position, entry_index))`;
    yield* sql`CREATE TABLE checkpoints (workspace_id TEXT NOT NULL, log_id TEXT NOT NULL, name TEXT NOT NULL, version REAL NOT NULL, record TEXT NOT NULL CHECK(json_valid(record)), PRIMARY KEY(workspace_id, log_id, name, version))`;
    yield* sql`CREATE TABLE invitations (workspace_id TEXT NOT NULL, id TEXT NOT NULL, record TEXT NOT NULL CHECK(json_valid(record)), PRIMARY KEY(workspace_id, id))`;
    yield* sql`CREATE TABLE notifications (workspace_id TEXT NOT NULL, id TEXT NOT NULL, recorded_at INTEGER NOT NULL, record TEXT NOT NULL CHECK(json_valid(record)), PRIMARY KEY(workspace_id, id))`;
    yield* sql`CREATE UNIQUE INDEX notifications_by_source_recipient ON notifications(workspace_id, json_extract(record, '$.source.logId'), json_extract(record, '$.source.entryId'), json_extract(record, '$.recipient._tag'), coalesce(json_extract(record, '$.recipient.id'), ''))`;
    yield* sql`CREATE INDEX notifications_by_recipient ON notifications(workspace_id, json_extract(record, '$.recipient._tag'), coalesce(json_extract(record, '$.recipient.id'), ''), recorded_at, id COLLATE BINARY)`;
    yield* sql`CREATE INDEX pending_notifications_by_recipient ON notifications(workspace_id, json_extract(record, '$.recipient._tag'), coalesce(json_extract(record, '$.recipient.id'), ''), recorded_at, id COLLATE BINARY) WHERE json_extract(record, '$.state._tag') = 'Pending'`;
    yield* sql`CREATE TABLE log_append_keys (workspace_id TEXT NOT NULL, log_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, commit_id TEXT NOT NULL, first_index INTEGER NOT NULL CHECK(first_index >= 0), entry_count INTEGER NOT NULL CHECK(entry_count > 0), PRIMARY KEY(workspace_id, log_id, idempotency_key), FOREIGN KEY(workspace_id, log_id, commit_id) REFERENCES log_batches(workspace_id, log_id, commit_id))`;
    yield* sql`CREATE INDEX log_entries_by_commit ON log_entries(workspace_id, log_id, commit_id, entry_index)`;
    yield* sql`CREATE INDEX log_entries_by_subject ON log_entries(workspace_id, log_id, subject, position, entry_index)`;
    yield* sql`CREATE INDEX log_entries_by_fact ON log_entries(workspace_id, log_id, fact_name, position, entry_index)`;
  }),
});

export * as Migrations from "./migrations.ts";
