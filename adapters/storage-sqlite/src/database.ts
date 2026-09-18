import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

const migrations = SqliteMigrator.fromRecord({
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
  }),
  "0002_invitations": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TABLE invitations (workspace_id TEXT NOT NULL, id TEXT NOT NULL, record TEXT NOT NULL CHECK(json_valid(record)), PRIMARY KEY(workspace_id, id))`;
  }),
});

/**
 * One SQLite connection, shared by every workspace view. A transaction whose
 * rollback failed leaves the connection unusable; the flag records that so
 * later transactions refuse rather than run on a connection in an unknown state.
 */
export interface Database {
  readonly sql: SqlClient.SqlClient;
  readonly health: { broken: boolean };
}

export class Service extends Context.Service<Service, Database>()(
  "@amends/storage-sqlite/database/Service",
) {}

export const make = Effect.fn("SqliteDatabase.make")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return Service.of({ sql, health: { broken: false } });
});

/** Open the file, bring its schema up to date, and share the connection. Transactions use BEGIN IMMEDIATE. */
export const layer = (filename: string) =>
  Layer.effect(Service, make()).pipe(
    Layer.provideMerge(
      SqliteMigrator.layer({ loader: migrations }).pipe(
        Layer.provideMerge(SqliteClient.layer({ filename, busyTimeout: 0 })),
      ),
    ),
  );

export * as SqliteDatabase from "./database.ts";
