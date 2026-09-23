import { describe, it, expect } from "@effect/vitest";
import { PgClient } from "@effect/sql-pg";
import { GroupApplication } from "@amends/core/group";
import { Actor, Identity } from "@amends/core/identity";
import { Fact, Journal, Publication, Subject } from "@amends/core/journal";
import { ThreadApplication } from "@amends/core/thread";
import { Member, MemberFacts } from "@amends/core/workspace";
import { Array, DateTime, Effect, Option, Redacted, Schema } from "effect";
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

  it.effect("thread, membership, inbox, journal, and directory lookups seek ordered indexes", () =>
    withDatabase((url) =>
      inDatabase(
        url,
        Effect.gen(function* () {
          const bound = yield* (yield* views()).forWorkspace(workspaceId);
          const workspace = yield* initialized(bound);
          const owner = Actor.Value.make({
            workspaceId,
            memberId: workspace.ownerMemberId,
            identity: { _tag: "Human", id: workspace.createdBy },
          });
          const memberIds = Array.makeBy(20, (index) => Member.Id.make(`member-${index}`));
          const threads = yield* Effect.gen(function* () {
            const journal = yield* Journal.Service;
            yield* journal
              .commit(
                Effect.forEach(memberIds, (memberId) =>
                  journal.publish(MemberFacts.Added, {
                    workspaceId,
                    memberId,
                    identity: { _tag: "Human", id: Identity.HumanId.make(memberId) },
                  }),
                ),
              )
              .pipe(Effect.provideService(Publication.Service, testProvenance()));
            const groups = yield* GroupApplication.Service;
            const threads = yield* ThreadApplication.Service;
            return yield* Effect.forEach([memberIds.slice(0, 10), memberIds.slice(10)], (members) =>
              Effect.gen(function* () {
                const group = yield* groups.createPrivateTeam({
                  name: "Team",
                  memberIds: [owner.memberId, ...members],
                });
                return yield* Effect.forEach(Array.range(1, 6), () =>
                  threads.startInGroup({ groupId: group.id, text: "Hello", mentions: members }),
                );
              }),
            ).pipe(Effect.map(Array.flatten), Effect.provideService(Actor.Service, owner));
          }).pipe(Effect.provide(core(bound)));
          const thread = threads[0]!.thread;
          const [admission] = yield* bound.groupMemberships.listActiveByMember(memberIds[0]!);
          // Mentioned members are notified; authors are not.
          const inbox = yield* bound.notifications.listByRecipient(
            { _tag: "Human", id: Identity.HumanId.make(memberIds[0]!) },
            { limit: 2 },
          );
          const facts = yield* Effect.flatMap(Journal.Service, (journal) =>
            journal.read({ name: "thread.created", limit: 1 }),
          ).pipe(Effect.provide(core(bound)));
          const sql = yield* SqlClient.SqlClient;
          yield* sql`ANALYZE`;
          const cases = [
            {
              index: "participations_by_thread",
              condition: "thread_id =",
              query: sql`SELECT id FROM thread_participations WHERE workspace_id = ${workspaceId} AND thread_id = ${thread.id} ORDER BY id COLLATE "C"`,
            },
            {
              index: "participations_by_thread",
              condition: "thread_id =",
              query: sql`SELECT id FROM thread_participations WHERE workspace_id = ${workspaceId} AND thread_id = ${thread.id} AND member_id = ${memberIds[0]!}`,
            },
            {
              index: "participations_by_admission",
              condition: "group_membership_id =",
              query: sql`SELECT id FROM thread_participations WHERE workspace_id = ${workspaceId} AND group_membership_id = ${admission!.id} ORDER BY id COLLATE "C"`,
            },
            {
              index: "group_memberships_by_member",
              condition: "member_id =",
              query: sql`SELECT id FROM group_memberships WHERE workspace_id = ${workspaceId} AND member_id = ${memberIds[0]!} AND status = 'active' ORDER BY id COLLATE "C"`,
            },
            {
              index: "threads_by_group",
              condition: "group_id =",
              query: sql`SELECT id FROM threads WHERE workspace_id = ${workspaceId} AND group_id = ${thread.groupId} ORDER BY id COLLATE "C"`,
            },
            {
              index: "notifications_by_recipient",
              condition: "ROW(recorded_at, (id)::text) >",
              query: sql`SELECT id FROM notifications WHERE workspace_id = ${workspaceId} AND recipient_kind = 'Human' AND coalesce(recipient_id, '') = ${memberIds[0]!} AND (recorded_at, id COLLATE "C") > (${DateTime.formatIso(inbox[0]!.recordedAt)}::timestamptz, ${inbox[0]!.id}) ORDER BY recorded_at, id COLLATE "C" LIMIT 20`,
            },
            {
              index: "log_entries_by_fact",
              condition: 'ROW("position", entry_index) >',
              query: sql`SELECT id FROM log_entries WHERE workspace_id = ${workspaceId} AND log_id = ${journalLog} AND fact_name = ${"thread.created"} AND (position, entry_index) > (${facts[0]!.position}, ${facts[0]!.index}) ORDER BY position, entry_index LIMIT 20`,
            },
            {
              index: "members_by_identity",
              condition: "identity_id =",
              query: sql`SELECT id FROM members WHERE identity_kind = 'Human' AND identity_id = ${workspace.createdBy} ORDER BY workspace_id, id`,
            },
          ];
          const plans = yield* sql.withTransaction(
            Effect.gen(function* () {
              // Leave only ordered index scans, so any remaining sort means no index supplies the order.
              yield* sql`SET LOCAL enable_seqscan = off`;
              yield* sql`SET LOCAL enable_bitmapscan = off`;
              yield* sql`SET LOCAL enable_sort = off`;
              return yield* Effect.forEach(cases, ({ query }) =>
                Effect.map(sql<{ "QUERY PLAN": string }>`EXPLAIN ${query}`, (rows) =>
                  rows.map((row) => row["QUERY PLAN"]).join("\n"),
                ),
              );
            }),
          );
          for (const [index, { index: name, condition }] of cases.entries()) {
            const plan = plans[index]!;
            expect(plan).toMatch(new RegExp(`Index (Only )?Scan (Backward )?using ${name} `));
            expect(plan.split("\n").find((line) => line.includes("Index Cond:"))).toContain(
              condition,
            );
            expect(plan).not.toMatch(/^\s*(->\s*)?Sort\b/m);
          }
        }),
      ),
    ),
  );
});
