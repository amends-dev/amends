import type { Harness } from "@amends/storage-conformance";
import { BunCrypto } from "@effect/platform-bun";
import { Effect, Layer, Redacted } from "effect";
import { Base64 } from "effect/encoding";
import { SqlClient } from "effect/sql";
import { layer } from "../src/index.ts";
import { database, inDatabase, setup } from "./support.ts";

/** Projection tables, truncated to discard every projected record. */
const projections = [
  "workspaces",
  "members",
  "roles",
  "builtin_role_revisions",
  "assignments",
  "invitations",
  "notifications",
  "groups",
  "group_memberships",
  "group_follows",
  "threads",
  "thread_participations",
  "thread_messages",
  "thread_activities",
  "tasks",
  "channels",
  "channel_bindings",
  "contacts",
  "channel_deliveries",
  "connections",
  "agents",
  "turns",
  "checkpoints",
  "live_projections",
];

const { available, withDatabase } = setup();

/** A fixed credential key for tests, 32 bytes as base64. */
const credentialKey = Redacted.make(Base64.encode(new Uint8Array(32).fill(7)));

/** A database for each test on the run's server; each connection is another host's pool. */
export const harness: Harness = {
  name: "PostgreSQL",
  available,
  crypto: BunCrypto.layer,
  withStorage: (use) =>
    withDatabase((url) => {
      const maintain = <A>(program: Effect.Effect<A, unknown, SqlClient.SqlClient>) =>
        inDatabase(url, program).pipe(Effect.orDie);
      return use({
        connect: (options) =>
          Layer.build(
            // Waiting readers rely on notifications: the fallback poll is the default five seconds.
            layer({
              credentialKey,
              ...(options?.failFast === true && { lockTimeout: "100 millis" }),
            }).pipe(Layer.provideMerge(database(url))),
          ).pipe(Effect.orDie),
        discardProjections: maintain(
          Effect.flatMap(SqlClient.SqlClient, (sql) =>
            sql.unsafe(`TRUNCATE ${projections.join(", ")}`),
          ),
        ),
        footprint: maintain(
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            const tables = yield* sql<{
              readonly name: string;
            }>`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`;
            let total = 0;
            for (const { name } of tables) {
              const [row] = yield* sql.unsafe<{ readonly count: number }>(
                `SELECT COUNT(*)::int AS count FROM "${name}"`,
              );
              total += row?.count ?? 0;
            }
            return total;
          }),
        ),
      });
    }),
};
