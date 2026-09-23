import { expect, it } from "@effect/vitest";
import { SqliteDatabase } from "../src/index.ts";
import { SqliteClient } from "@effect/sql-sqlite-bun";
import { Cause, Effect, Exit, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { workspaceId, views, inDatabase, initialized, temporary } from "./support.ts";

it.effect.each(["make", "layer"] as const)(
  "database %s initializes every store and preserves data when reopened",
  (construction) =>
    temporary((filename) =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          const database = yield* SqliteDatabase.Service;
          expect(database.sql).toBe(yield* SqlClient.SqlClient);
          expect(yield* database.sql`PRAGMA foreign_keys`).toEqual([{ foreign_keys: 1 }]);
          const bound = yield* (yield* views).forWorkspace(workspaceId);
          const record = yield* initialized(bound);
          expect(yield* bound.invitations.list).toEqual([]);
          return record;
        });
        const configured =
          construction === "make"
            ? Effect.flatMap(SqliteDatabase.make(), (database) =>
                program.pipe(Effect.provideService(SqliteDatabase.Service, database)),
              ).pipe(Effect.provide(SqliteClient.layer({ filename, busyTimeout: 0 })))
            : program.pipe(Effect.provide(SqliteDatabase.layer(filename)));
        const record = yield* configured;
        yield* inDatabase(
          filename,
          Effect.gen(function* () {
            const bound = yield* (yield* views).forWorkspace(workspaceId);
            expect(yield* bound.workspace.get).toEqual(Option.some(record));
            expect(yield* bound.members.list).toHaveLength(1);
            expect(yield* bound.invitations.list).toEqual([]);
          }),
        );
      }),
    ),
);

it.effect(
  "database construction fails and rolls back incomplete schema initialization before retry",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`CREATE TABLE members (unexpected TEXT)`;
      const exit = yield* Effect.exit(SqliteDatabase.make());
      if (!Exit.isFailure(exit)) throw new Error("Expected initialization failure");
      expect(Cause.hasDies(exit.cause)).toBe(true);
      expect(yield* sql`SELECT migration_id FROM effect_sql_migrations`).toEqual([]);
      expect(
        yield* sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('workspaces', 'invitations')`,
      ).toEqual([]);
      yield* sql`DROP TABLE members`;
      const database = yield* SqliteDatabase.make();
      expect(yield* database.sql`SELECT COUNT(*) AS count FROM invitations`).toEqual([
        { count: 0 },
      ]);
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", busyTimeout: 0 }))),
);

it.effect("declared foreign keys reject rows that reference missing records", () =>
  temporary((filename) =>
    inDatabase(
      filename,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const bound = yield* (yield* views).forWorkspace(workspaceId);
        const workspace = yield* initialized(bound);
        const orphan = (createdBy: string) =>
          sql`INSERT INTO groups (workspace_id, id, created_by, record) VALUES (${workspaceId}, ${`group-${createdBy}`}, ${createdBy}, '{}')`;
        const rejected = yield* Effect.flip(orphan("missing-member"));
        expect(rejected.reason._tag).toBe("ConstraintError");
        expect(yield* sql`SELECT id FROM groups`).toEqual([]);
        yield* orphan(workspace.ownerMemberId);
        expect(yield* sql`PRAGMA foreign_key_check`).toEqual([]);
      }),
    ),
  ),
);

it.effect("thread, membership, and directory lookups seek their indexes without sorting", () =>
  temporary((filename) =>
    inDatabase(
      filename,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        // Each lookup must narrow by more than its workspace and return rows in query order.
        const cases = [
          {
            access: "participations_by_thread (workspace_id=? AND thread_id=?)",
            query: sql`SELECT id FROM thread_participations WHERE workspace_id = ${workspaceId} AND thread_id = ${"thread"} ORDER BY id COLLATE BINARY`,
          },
          {
            access: "participations_by_thread (workspace_id=? AND thread_id=?)",
            query: sql`SELECT id FROM thread_participations WHERE workspace_id = ${workspaceId} AND thread_id = ${"thread"} AND member_id = ${"member"}`,
          },
          {
            access: "group_memberships_by_member (workspace_id=? AND member_id=?)",
            query: sql`SELECT id FROM group_memberships WHERE workspace_id = ${workspaceId} AND member_id = ${"member"} AND json_extract(record, '$.status') = 'active' ORDER BY id COLLATE BINARY`,
          },
          {
            access: "invitations_by_recipient (<expr>=? AND <expr>=? AND workspace_id=?)",
            query: sql`SELECT record FROM invitations WHERE workspace_id = ${workspaceId} AND json_extract(record, '$.details.recipientId') = ${"alice"} AND json_extract(record, '$.state._tag') = 'Pending' ORDER BY id`,
          },
          {
            access: "invitations_by_recipient (<expr>=? AND <expr>=?)",
            query: sql`SELECT record FROM invitations WHERE json_extract(record, '$.details.recipientId') = ${"alice"} AND json_extract(record, '$.state._tag') = 'Pending' ORDER BY workspace_id, id`,
          },
          {
            access: "members_by_identity (<expr>=? AND <expr>=?)",
            query: sql`SELECT w.record AS workspace, m.record AS member, (SELECT COUNT(*) FROM members p WHERE p.workspace_id = m.workspace_id AND json_extract(p.record, '$.status') = 'active') AS activeMemberCount FROM members m JOIN workspaces w ON w.workspace_id = m.workspace_id WHERE json_extract(m.record, '$.identity._tag') = ${"Human"} AND json_extract(m.record, '$.identity.id') = ${"alice"} ORDER BY m.workspace_id, m.id`,
          },
        ];
        for (const { access, query } of cases) {
          const details = (yield* sql<{ detail: string }>`EXPLAIN QUERY PLAN ${query}`).map(
            (row) => row.detail,
          );
          expect(details.some((detail) => detail.endsWith(access))).toBe(true);
          expect(details.some((detail) => detail.includes("TEMP B-TREE"))).toBe(false);
        }
      }),
    ),
  ),
);

it.effect("commit entry lookups seek within one batch and return index order without sorting", () =>
  temporary((filename) =>
    inDatabase(
      filename,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        // Complete checkpoint batches and keyed append slices use the same access path.
        for (const range of [sql``, sql`AND entry_index >= ${1} AND entry_index < ${3}`]) {
          const plan = yield* sql<{
            detail: string;
          }>`EXPLAIN QUERY PLAN SELECT id, log_id, position, commit_id, entry_index, recorded_at, payload, subject, fact_name, fact_version, provenance FROM log_entries WHERE workspace_id = ${workspaceId} AND log_id = ${"journal"} AND commit_id = ${"commit"} ${range} ORDER BY entry_index`;
          const details = plan.map((row) => row.detail);
          expect(
            details.some((detail) =>
              detail.includes("workspace_id=? AND log_id=? AND commit_id=?"),
            ),
          ).toBe(true);
          expect(details.some((detail) => detail.includes("TEMP B-TREE"))).toBe(false);
        }
      }),
    ),
  ),
);
