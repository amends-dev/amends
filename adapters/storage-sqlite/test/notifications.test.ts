import { Identity } from "@amends/core/identity";
import { Entry } from "@amends/core/journal";
import { Notification, type NotificationStore } from "@amends/core/notification";
import { Suites } from "@amends/storage-conformance";
import { expect, it } from "@effect/vitest";
import { DateTime, Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { harness } from "./harness.ts";
import { boundTo, inDatabase, initialized, temporary, workspaceId } from "./support.ts";

Suites.notifications(harness);

it.effect("malformed persisted notifications fail reads instead of returning invalid records", () =>
  temporary((filename) =>
    inDatabase(
      filename,
      Effect.gen(function* () {
        const bound = yield* boundTo(workspaceId);
        yield* initialized(bound);
        const human = Identity.Reference.cases.Human.make({
          id: Identity.HumanId.make("recipient"),
        });
        const value: Notification.Record = {
          id: Notification.Id.make("malformed"),
          workspaceId,
          source: { logId: Entry.LogId.make("journal"), entryId: Entry.Id.make("source") },
          recipient: human,
          recordedAt: DateTime.makeUnsafe("2026-09-19T12:00:00.123Z"),
          state: { _tag: "Pending" },
        };
        yield* bound.store.transaction(bound.notifications.insert(value));
        const sql = yield* SqlClient.SqlClient;
        yield* sql`UPDATE notifications SET record = json_set(record, '$.source.entryId', '') WHERE workspace_id = ${workspaceId} AND id = ${value.id}`;
        const reads: ReadonlyArray<Effect.Effect<unknown, NotificationStore.Failure>> = [
          bound.notifications.get(value.id),
          bound.notifications.listByRecipient(human, { limit: 20 }),
          bound.notifications.listPendingByRecipient(human, { limit: 20 }),
        ];
        for (const operation of reads)
          expect(yield* Effect.flip(operation)).toMatchObject({
            _tag: "NotificationStore.Failure",
          });
      }),
    ),
  ),
);
