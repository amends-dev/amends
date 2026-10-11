import { Codec, Journal, Log, Publication, Subject } from "@amends-dev/core/journal";
import { Changed, Changed2, Other } from "@amends-dev/storage-conformance";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { boundTo, core, inDatabase, setup, testProvenance, workspaceId } from "./support.ts";

const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.effect("fact metadata is stored in queryable columns beside the binary payload", () =>
    withDatabase((url) =>
      inDatabase(
        url,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId);
          yield* Effect.gen(function* () {
            const journal = yield* Journal.Service;
            yield* journal.commit(
              Effect.gen(function* () {
                yield* journal.publish(Changed, "first");
                yield* journal.publish(Other, "noise");
                yield* journal.publish(Changed2, "second");
              }),
            );
            yield* journal.publish(Changed, "third");
          }).pipe(
            Effect.provideService(Publication.Service, testProvenance(workspaceId)),
            Effect.provide(core(bound)),
          );
          const rows =
            yield* (yield* SqlClient.SqlClient)`SELECT subject, fact_name, fact_version, payload FROM log_entries WHERE workspace_id = ${workspaceId} AND log_id = ${Log.Id.make("journal")} ORDER BY position, entry_index`;
          expect(rows.map((row) => row.fact_name)).toEqual([
            Changed.name,
            Other.name,
            Changed.name,
            Changed.name,
          ]);
          expect(rows.map((row) => row.fact_version)).toEqual([1, 1, 2, 1]);
          expect(new Set(rows.map((row) => row.subject))).toEqual(
            new Set([Subject.make("test", "entity")]),
          );
          expect(rows[0]?.payload).toEqual(yield* Codec.make(Changed).encode("first"));
        }),
      ),
    ),
  );
});
