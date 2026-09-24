import { Role, RoleFacts } from "@amends/core/authorization";
import { Journal, Log, Publication, Store } from "@amends/core/journal";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import type { Harness } from "./harness.ts";
import { forWorkspace, otherWorkspaceId, Support, testProvenance, workspaceId } from "./support.ts";

const key = Log.IdempotencyKey.make("occurrence/one");
const executionId = Log.Id.make("execution");
const options = { idempotencyKey: key };

/** Keyed appends: durable identity, validation, rollback, and concurrent attempts. */
export const idempotency = (harness: Harness) => {
  const { core, initialized } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: idempotency`, () => {
    it.effect("one commit keeps every keyed append past the parameters a statement can bind", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
          yield* initialized(bound);
          yield* Effect.gen(function* () {
            const journal = yield* Journal.Service;
            const log = (yield* Log.Service).open({ id: executionId, schema: Schema.String });
            const keyOf = (index: number) => Log.IdempotencyKey.make(`output/${index}`);
            const count = 6_000;
            yield* journal.commit(
              Effect.gen(function* () {
                for (let index = 0; index < count; index += 1)
                  yield* log.append(`output ${index}`, { idempotencyKey: keyOf(index) });
              }),
            );
            const [batch] = yield* log.read({ limit: 1 });
            expect(batch?.entries).toHaveLength(count);
            expect(yield* log.getAppend(keyOf(count - 1))).toEqual(
              Option.some([batch?.entries.at(-1)]),
            );
          }).pipe(Effect.provide(core(bound)));
        }),
      ),
    );

    it.effect(
      "keyed publications and append slices survive reopening with their original identities",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const original = yield* Effect.scoped(
              Effect.gen(function* () {
                const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
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
                  const log = (yield* Log.Service).open({
                    id: executionId,
                    schema: Schema.String,
                  });
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
            const host = yield* storage.connect();
            const bound = yield* forWorkspace(host, workspaceId);
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
              expect(
                (yield* log.read({ limit: 10 })).flatMap((batch) => batch.entries),
              ).toHaveLength(4);
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
            const other = yield* forWorkspace(host, otherWorkspaceId);
            yield* Effect.gen(function* () {
              const log = (yield* Log.Service).open({ id: executionId, schema: Schema.String });
              expect(yield* log.getAppend(key)).toEqual(Option.none());
              yield* log.append("other workspace", options);
            }).pipe(Effect.provide(core(other)));
          }),
        ),
    );

    it.effect(
      "native keyed append validates content, rolls its receipt back, and preserves returned byte ownership",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
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
        ),
    );

    it.effect("independent hosts converge concurrent keyed attempts on one durable append", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const a = yield* forWorkspace(yield* storage.connect(), workspaceId);
          const b = yield* forWorkspace(yield* storage.connect(), workspaceId);
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
  });
};
