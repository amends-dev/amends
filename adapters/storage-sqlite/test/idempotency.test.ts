import { expect, test as it } from "bun:test";
import { SqliteDatabase } from "../src/index.ts";
import {
  core,
  views,
  initialized,
  inDatabase,
  temporary as withDatabase,
  workspaceId,
  otherWorkspaceId,
  testProvenance,
} from "./support.ts";
import { Journal, Log, Publication, Store } from "@amends/core/journal";
import { Role, RoleFacts } from "@amends/core/authorization";
import { Effect, Layer, Option, Schema } from "effect";

const key = Log.IdempotencyKey.make("occurrence/one");
const executionId = Log.Id.make("execution");
const options = { idempotencyKey: key };

it("keyed publications and append slices survive reopening with their original identities", async () =>
  withDatabase(async (location) => {
    const original = await inDatabase(
      location,
      Effect.gen(function* () {
        const bound = yield* (yield* views).forWorkspace(workspaceId);
        yield* initialized(bound);
        return yield* Effect.gen(function* () {
          const journal = yield* Journal.Service;
          const payload = {
            workspaceId,
            roleId: Role.Id.make("keyed-role"),
            name: "Keyed",
            permissions: [],
          };
          const first = yield* journal.publish(RoleFacts.Created, payload);
          expect(
            yield* journal.publish(RoleFacts.Created, payload, {
              expectedAfter: Option.none(),
            }),
          ).toEqual(first);
          expect(yield* bound.roles.get(payload.roleId)).toMatchObject({
            _tag: "Some",
            value: { id: payload.roleId, name: "Keyed" },
          });
          const log = (yield* Log.Service).open({ id: executionId, schema: Schema.String });
          const batch = yield* journal.commit(
            Effect.gen(function* () {
              yield* log.append("before");
              const entries = yield* log.appendAll(["one", "two"], options);
              yield* log.append("after");
              expect(yield* log.appendAll(["one", "two"], options)).toEqual(entries);
              return entries;
            }),
          );
          expect(batch.map((entry) => entry.index)).toEqual([1, 2]);
          return { first, batch, payload };
        }).pipe(
          Effect.provideService(Publication.Service, testProvenance(workspaceId)),
          Effect.provide(core(bound)),
        );
      }),
    );
    await inDatabase(
      location,
      Effect.gen(function* () {
        const storage = yield* views;
        const bound = yield* storage.forWorkspace(workspaceId);
        yield* Effect.gen(function* () {
          const journal = yield* Journal.Service;
          expect(yield* journal.publish(RoleFacts.Created, original.payload)).toEqual(
            original.first,
          );
          const log = (yield* Log.Service).open({ id: executionId, schema: Schema.String });
          expect(yield* log.getAppend(key)).toEqual(Option.some(original.batch));
          expect(
            yield* log.appendAll(["one", "two"], { ...options, expectedAfter: Option.none() }),
          ).toEqual(original.batch);
          expect((yield* log.read({ limit: 10 })).flatMap((batch) => batch.entries)).toHaveLength(
            4,
          );
          for (const payloads of [["one"], ["two", "one"], ["changed", "two"]])
            expect((yield* Effect.flip(log.appendAll(payloads, options)))._tag).toBe(
              "JournalStore.Conflict",
            );
          expect(
            (yield* Effect.flip(
              journal.publish(RoleFacts.Created, { ...original.payload, name: "Changed" }),
            ))._tag,
          ).toBe("JournalStore.Conflict");
        }).pipe(
          Effect.provideService(Publication.Service, testProvenance(workspaceId)),
          Effect.provide(core(bound)),
        );
        const other = yield* storage.forWorkspace(otherWorkspaceId);
        yield* Effect.gen(function* () {
          const log = (yield* Log.Service).open({ id: executionId, schema: Schema.String });
          expect(yield* log.getAppend(key)).toEqual(Option.none());
          yield* log.append("other workspace", options);
        }).pipe(Effect.provide(core(other)));
      }),
    );
  }));

it("native keyed append validates content, rolls its receipt back, and preserves returned byte ownership", async () =>
  withDatabase(async (location) => {
    await inDatabase(
      location,
      Effect.gen(function* () {
        const bound = yield* (yield* views).forWorkspace(workspaceId);
        const append = (payloads: ReadonlyArray<Uint8Array>, idempotencyKey = key) =>
          Effect.flatMap(Store.Transaction, (native) =>
            native.append({
              logId: executionId,
              entries: payloads.map((payload) => ({ payload })),
              idempotencyKey,
            }),
          );
        const input = [new Uint8Array([1, 2]), new Uint8Array([3])];
        const failed = yield* Effect.flip(
          bound.store.transaction(
            Effect.gen(function* () {
              yield* append(input);
              expect(Option.isSome(yield* bound.store.getAppend(executionId, key))).toBe(true);
              return yield* Effect.fail("rollback");
            }),
          ),
        );
        expect(failed).toBe("rollback");
        expect(yield* bound.store.getAppend(executionId, key)).toEqual(Option.none());
        const first = yield* bound.store.transaction(append(input));
        const replay = yield* bound.store.transaction(append(input));
        expect(replay).toEqual(first);
        if (replay[0] === undefined) return yield* Effect.die("Missing append");
        replay[0].payload[0] = 99;
        const receipt = yield* bound.store.getAppend(executionId, key);
        expect(Option.isSome(receipt) && receipt.value.entries[0].payload[0]).toBe(1);
        for (const payloads of [
          [new Uint8Array([1, 2])],
          [new Uint8Array([3]), new Uint8Array([1, 2])],
        ])
          expect((yield* Effect.flip(bound.store.transaction(append(payloads))))._tag).toBe(
            "JournalStore.Conflict",
          );
        expect(
          (yield* Effect.flip(
            bound.store.transaction(append([], Log.IdempotencyKey.make("empty"))),
          ))._tag,
        ).toBe("JournalStore.Conflict");
        const invalid: Store.AppendInput = {
          logId: executionId,
          entries: input.map((payload) => ({ payload })),
          idempotencyKey: Log.IdempotencyKey.make("valid"),
        };
        Reflect.set(invalid, "idempotencyKey", " ");
        expect(
          (yield* Effect.flip(
            bound.store.transaction(
              Effect.flatMap(Store.Transaction, (native) => native.append(invalid)),
            ),
          ))._tag,
        ).toBe("JournalStore.Conflict");
      }),
    );
  }));

it("independent connections converge concurrent keyed attempts on one durable append", async () =>
  withDatabase(async (location) => {
    await inDatabase(
      location,
      Effect.scoped(
        Effect.gen(function* () {
          const a = yield* (yield* views).forWorkspace(workspaceId);
          const otherContext = yield* Layer.build(SqliteDatabase.layer(location));
          const other = yield* views.pipe(Effect.provide(otherContext));
          const b = yield* other.forWorkspace(workspaceId);
          const append = Effect.flatMap(Store.Transaction, (native) =>
            native.append({
              logId: executionId,
              entries: [{ payload: new Uint8Array([7]) }],
              idempotencyKey: key,
            }),
          );
          const attempts = yield* Effect.all(
            [
              a.store.transaction(append).pipe(Effect.result),
              b.store.transaction(append).pipe(Effect.result),
            ],
            { concurrency: "unbounded" },
          );
          const successes = attempts.filter((result) => result._tag === "Success");
          expect(successes.length).toBeGreaterThan(0);
          for (const result of attempts)
            if (result._tag === "Failure")
              expect(result.failure._tag).toBe("JournalStore.Conflict");
          const first = yield* a.store.transaction(append);
          const second = yield* b.store.transaction(append);
          expect(second).toEqual(first);
          expect(
            (yield* a.store.read(executionId, { limit: 10 })).flatMap((batch) => batch.entries),
          ).toHaveLength(1);
        }),
      ),
    );
  }));
