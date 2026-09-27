import { Entry, Store } from "@amends/core/journal";
import { Suites } from "@amends/storage-conformance";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Layer, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { harness } from "./harness.ts";
import { database, inDatabase, setup, views, workspaceId } from "./support.ts";

Suites.journal(harness);

const execution = Entry.LogId.make("execution");
const { available, withDatabase } = setup();

/** Two pools over one database, as two processes would hold; readers never poll. */
const pools = (url: string) =>
  Effect.gen(function* () {
    const reader = yield* Layer.build(database(url));
    const writer = yield* Layer.build(database(url));
    const waiting = yield* views({ pollInterval: "1 hour" }).pipe(
      Effect.flatMap((storage) => storage.forWorkspace(workspaceId)),
      Effect.provide(reader),
    );
    const writing = yield* views().pipe(
      Effect.flatMap((storage) => storage.forWorkspace(workspaceId)),
      Effect.provide(writer),
    );
    const appending = Effect.flatMap(Store.Transaction, (transaction) =>
      transaction.append({ logId: execution, entries: [{ payload: new Uint8Array([1]) }] }),
    );
    const append = writing.store.transaction(appending);
    // Appends, then fails, so the transaction rolls back.
    const abandoned = writing.store.transaction(
      Effect.andThen(appending, Effect.fail("abandoned" as const)),
    );
    return { wait: waiting.store.waitForAppend(execution, Option.none()), append, abandoned };
  });

describe.skipIf(!available)("PostgreSQL", () => {
  it.live("a waiting reader wakes on another pool's commit through its notification", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const { wait, append } = yield* pools(url);
        const waiter = yield* Effect.forkChild(wait);
        // Let the reader find the log empty and start waiting; it would otherwise poll hourly.
        yield* Effect.sleep("300 millis");
        expect(waiter.pollUnsafe()).toBeUndefined();
        yield* append;
        yield* Fiber.join(waiter).pipe(Effect.timeout("5 seconds"));
      }).pipe(Effect.scoped),
    ),
  );

  it.live("a commit notifies once it has committed, and one that rolls back never does", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const { wait, append, abandoned } = yield* pools(url);
        const waiter = yield* Effect.forkChild(wait);
        yield* Effect.sleep("300 millis");
        expect(yield* Effect.flip(abandoned)).toBe("abandoned");
        yield* Effect.sleep("500 millis");
        expect(waiter.pollUnsafe()).toBeUndefined();
        yield* append;
        yield* Fiber.join(waiter).pipe(Effect.timeout("5 seconds"));
      }).pipe(Effect.scoped),
    ),
  );

  it.live("an append made while the listener reconnects still wakes the reader", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const { wait, append } = yield* pools(url);
        const waiter = yield* Effect.forkChild(wait);
        yield* Effect.sleep("300 millis");
        // End the listener's session, then append before it listens again: that notification
        // reaches nobody, and the reader must re-check once the listener is back.
        const ended = yield* inDatabase(
          url,
          Effect.flatMap(
            SqlClient.SqlClient,
            (sql) => sql<{ readonly ended: boolean }>`
              SELECT pg_terminate_backend(pid) AS ended FROM pg_stat_activity
              WHERE datname = current_database() AND query LIKE 'LISTEN%'`,
          ),
        );
        expect(ended.map((row) => row.ended)).toEqual([true]);
        yield* append;
        yield* Fiber.join(waiter).pipe(Effect.timeout("5 seconds"));
      }).pipe(Effect.scoped),
    ),
  );
});
