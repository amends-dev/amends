import { Identity } from "@amends-dev/core/identity";
import { Entry } from "@amends-dev/core/journal";
import { Member } from "@amends-dev/core/workspace";
import { Notification, type NotificationStore } from "@amends-dev/core/notification";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect } from "effect";
import { SqlClient } from "effect/sql";
import { boundTo, inDatabase, initialized, setup, workspaceId } from "./support.ts";

const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.effect(
    "malformed persisted notifications fail reads instead of returning invalid records",
    () =>
      withDatabase((url) =>
        inDatabase(
          url,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            yield* initialized(bound);
            const human = Notification.ofMember(
              Member.Id.make("recipient-member"),
              Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("recipient") }),
            );
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
            yield* sql`UPDATE notifications SET source_entry_id = '' WHERE workspace_id = ${workspaceId} AND id = ${value.id}`;
            const reads: ReadonlyArray<Effect.Effect<unknown, NotificationStore.Failure>> = [
              bound.notifications.get(value.id),
              bound.notifications.listLatestByRecipient(human, { limit: 20 }),
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
});
