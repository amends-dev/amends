import { SqliteMigrator } from "@effect/sql-sqlite-bun";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

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
    yield* sql`CREATE TABLE log_entries (workspace_id TEXT NOT NULL, id TEXT NOT NULL, log_id TEXT NOT NULL, position INTEGER NOT NULL, commit_id TEXT NOT NULL, entry_index INTEGER NOT NULL, recorded_at TEXT NOT NULL, payload BLOB NOT NULL, PRIMARY KEY(workspace_id, id), UNIQUE(workspace_id, log_id, position, entry_index))`;
    yield* sql`CREATE TABLE checkpoints (workspace_id TEXT NOT NULL, log_id TEXT NOT NULL, name TEXT NOT NULL, version REAL NOT NULL, record TEXT NOT NULL CHECK(json_valid(record)), PRIMARY KEY(workspace_id, log_id, name, version))`;
    yield* sql`CREATE TABLE invitations (workspace_id TEXT NOT NULL, id TEXT NOT NULL, record TEXT NOT NULL CHECK(json_valid(record)), PRIMARY KEY(workspace_id, id))`;
  }),
  "0002_notifications": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TABLE notifications (workspace_id TEXT NOT NULL, id TEXT NOT NULL, recorded_at INTEGER NOT NULL, record TEXT NOT NULL CHECK(json_valid(record)), PRIMARY KEY(workspace_id, id))`;
    yield* sql`CREATE UNIQUE INDEX notifications_by_source_recipient ON notifications(workspace_id, json_extract(record, '$.source.logId'), json_extract(record, '$.source.entryId'), json_extract(record, '$.recipient._tag'), json_extract(record, '$.recipient.id'))`;
    yield* sql`CREATE INDEX notifications_by_recipient ON notifications(workspace_id, json_extract(record, '$.recipient._tag'), json_extract(record, '$.recipient.id'), recorded_at, id COLLATE BINARY)`;
    yield* sql`CREATE INDEX pending_notifications_by_recipient ON notifications(workspace_id, json_extract(record, '$.recipient._tag'), json_extract(record, '$.recipient.id'), recorded_at, id COLLATE BINARY) WHERE json_extract(record, '$.state._tag') = 'Pending'`;
  }),
});

export * as Migrations from "./migrations.ts";
