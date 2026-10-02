import { Connection, ConnectionCredentialStore } from "@amends/core/connection";
import { Suites } from "@amends/storage-conformance";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Redacted } from "effect";
import { Base64 } from "effect/encoding";
import { SqlClient } from "effect/sql";
import { harness } from "./harness.ts";
import { inDatabase, setup, views, workspaceId } from "./support.ts";

Suites.connections(harness);

const credentialKey = Redacted.make(Base64.encode(new Uint8Array(32).fill(9)));
const credential = {
  id: Connection.CredentialId.make("credential-one"),
  connectionId: Connection.Id.make("connection-one"),
  secret: Redacted.make("sk-sealed-at-rest"),
};

const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL connection credentials", () => {
  it.effect("seals secrets at rest, bound to their row, and opens them only with the key", () =>
    withDatabase((url) =>
      inDatabase(
        url,
        Effect.gen(function* () {
          const bound = yield* (yield* views({ credentialKey })).forWorkspace(workspaceId);
          yield* bound.store.transaction(bound.credentials.put(credential));
          const sql = yield* SqlClient.SqlClient;
          const [row] = yield* sql<{ readonly sealed: string }>`
            SELECT sealed FROM connection_credentials WHERE workspace_id = ${workspaceId}`;
          expect(row?.sealed).toMatch(/^v1:/);
          expect(row?.sealed).not.toContain("sk-sealed-at-rest");
          expect(
            Option.map(yield* bound.credentials.get(credential.id), (found) =>
              Redacted.value(found.secret),
            ),
          ).toEqual(Option.some("sk-sealed-at-rest"));

          // A sealed value moved to another credential's row does not open there.
          yield* sql`UPDATE connection_credentials SET connection_id = 'connection-two' WHERE workspace_id = ${workspaceId}`;
          expect(yield* Effect.flip(bound.credentials.get(credential.id))).toBeInstanceOf(
            ConnectionCredentialStore.Failure,
          );
        }),
      ),
    ),
  );

  it.effect("stores and reads no credentials on a host without a key", () =>
    withDatabase((url) =>
      inDatabase(
        url,
        Effect.gen(function* () {
          const bound = yield* (yield* views()).forWorkspace(workspaceId);
          expect(
            yield* Effect.flip(bound.store.transaction(bound.credentials.put(credential))),
          ).toBeInstanceOf(ConnectionCredentialStore.Unavailable);
          expect(yield* Effect.flip(bound.credentials.get(credential.id))).toBeInstanceOf(
            ConnectionCredentialStore.Unavailable,
          );
        }),
      ),
    ),
  );

  it.effect("refuses a credential key that is not 32 bytes of base64 when the host starts", () =>
    withDatabase((url) =>
      inDatabase(
        url,
        Effect.gen(function* () {
          const exit = yield* Effect.exit(views({ credentialKey: Redacted.make("too-short") }));
          expect(exit._tag).toBe("Failure");
        }),
      ),
    ),
  );
});
