import { describe, it, expect } from "@effect/vitest";
import { PgClient } from "@effect/sql-pg";
import { Fact, Journal, Publication, Subject } from "@amends/core/journal";
import { Array, Effect, Option, Redacted, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { PostgresDatabase } from "../src/index.ts";
import {
  core,
  database,
  inDatabase,
  initialized,
  journalLog,
  setup,
  testProvenance,
  views,
  workspaceId,
} from "./support.ts";

const Noted = Fact.make("test.noted", {
  version: 1,
  subject: (payload) => Subject.make("test", payload.id),
  payload: Schema.Struct({ id: Schema.String }),
});

const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  for (const construction of ["make", "layer"] as const)
    it.effect(
      `database ${construction} initializes every store and preserves data when reopened`,
      () =>
        withDatabase((url) =>
          Effect.gen(function* () {
            const program = Effect.gen(function* () {
              const database = yield* PostgresDatabase.Service;
              expect(database.sql).toBe(yield* SqlClient.SqlClient);
              const bound = yield* (yield* views()).forWorkspace(workspaceId);
              const record = yield* initialized(bound);
              expect(yield* bound.invitations.list).toEqual([]);
              return record;
            });
            const configured =
              construction === "make"
                ? Effect.flatMap(PostgresDatabase.make(), (database) =>
                    program.pipe(Effect.provideService(PostgresDatabase.Service, database)),
                  ).pipe(
                    Effect.provide(PgClient.layer({ url: Redacted.make(url), maxConnections: 4 })),
                  )
                : program.pipe(Effect.provide(database(url)));
            const record = yield* configured;
            yield* inDatabase(
              url,
              Effect.gen(function* () {
                const bound = yield* (yield* views()).forWorkspace(workspaceId);
                expect(yield* bound.workspace.get).toEqual(Option.some(record));
                expect(yield* bound.members.list).toHaveLength(1);
                expect(yield* bound.invitations.list).toEqual([]);
              }),
            );
          }),
        ),
    );

  it.effect("commit entry lookups seek within one batch through the commit index", () =>
    withDatabase((url) =>
      inDatabase(
        url,
        Effect.gen(function* () {
          const bound = yield* (yield* views()).forWorkspace(workspaceId);
          yield* initialized(bound);
          const batches = yield* Effect.gen(function* () {
            const journal = yield* Journal.Service;
            return yield* Effect.forEach(Array.range(1, 20), (batch) =>
              journal.commit(
                Effect.forEach(Array.range(1, 10), (entry) =>
                  journal.publish(Noted, { id: `${batch}-${entry}` }),
                ),
              ),
            );
          }).pipe(
            Effect.provideService(Publication.Service, testProvenance()),
            Effect.provide(core(bound)),
          );
          const commitId = batches[10]![0]!.commitId;
          const sql = yield* SqlClient.SqlClient;
          yield* sql`ANALYZE log_entries`;
          const plans = yield* sql.withTransaction(
            Effect.gen(function* () {
              // Compare index access paths; a small table is otherwise cheapest to scan.
              yield* sql`SET LOCAL enable_seqscan = off`;
              const plan = (
                query: Effect.Effect<ReadonlyArray<{ "QUERY PLAN": string }>, unknown>,
              ) => Effect.map(query, (rows) => rows.map((row) => row["QUERY PLAN"]).join("\n"));
              // Appends seek the next index; keyed receipts read a slice of one batch.
              return yield* Effect.all([
                plan(
                  sql`EXPLAIN SELECT max(entry_index) FROM log_entries WHERE workspace_id = ${workspaceId} AND log_id = ${journalLog} AND commit_id = ${commitId}`,
                ),
                plan(
                  sql`EXPLAIN SELECT id, entry_index, payload FROM log_entries WHERE workspace_id = ${workspaceId} AND log_id = ${journalLog} AND commit_id = ${commitId} AND entry_index >= ${1} AND entry_index < ${3} ORDER BY entry_index`,
                ),
              ]);
            }),
          );
          // The planner may still sort a tiny slice; the commit must bound the index scan itself.
          for (const plan of plans) {
            expect(plan).toMatch(/Index (Only )?Scan (Backward )?(using|on) log_entries_by_commit/);
            expect(plan).toMatch(/Index Cond: .*commit_id = /);
            expect(plan).not.toMatch(/Filter: .*commit_id/);
          }
        }),
      ),
    ),
  );
});
