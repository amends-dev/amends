import { Identity } from "@amends-dev/core/identity";
import { Accounts } from "@amends-dev/gateway";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import type { Harness } from "./harness.ts";
import { runHost } from "./support.ts";

const alice = Accounts.Email.make("alice@example.com");
const bob = Accounts.Email.make("bob@example.com");

const findOrCreate = (email: Accounts.Email) =>
  Effect.flatMap(Accounts.Service, (accounts) => accounts.findOrCreate(email));
const findByIds = (ids: ReadonlyArray<Identity.HumanId>) =>
  Effect.flatMap(Accounts.Service, (accounts) => accounts.findByIds(ids));

/** The host's accounts: one for each address, whichever host asks, found again by human ID. */
export const accounts = (harness: Harness) => {
  describe.skipIf(!harness.available)(`${harness.name}: accounts`, () => {
    it.effect("an address has one account, which every host finds", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const created = yield* runHost(storage, findOrCreate(alice));
          expect(created.email).toBe(alice);
          expect(created.id).not.toBe(alice);
          expect(yield* runHost(storage, findOrCreate(alice))).toEqual(created);
          const other = yield* runHost(storage, findOrCreate(bob));
          expect(other.id).not.toBe(created.id);
        }),
      ),
    );

    it.effect("an address typed with capitals or spaces is the same account", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const typed = yield* Schema.decodeUnknownEffect(Accounts.Email)(" Alice@Example.COM ");
          expect(typed).toBe(alice);
          const created = yield* runHost(storage, findOrCreate(alice));
          expect(yield* runHost(storage, findOrCreate(typed))).toEqual(created);
        }),
      ),
    );

    it.effect("hosts asking for a new address at once share one account", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const found = yield* Effect.all(
            Array.from({ length: 4 }, () => runHost(storage, findOrCreate(alice))),
            { concurrency: "unbounded" },
          );
          expect(new Set(found.map((account) => account.id)).size).toBe(1);
        }),
      ),
    );

    it.effect("finding by IDs leaves out an ID no account has", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const first = yield* runHost(storage, findOrCreate(alice));
          const second = yield* runHost(storage, findOrCreate(bob));
          const unknown = Identity.HumanId.make("unknown");
          const found = yield* runHost(storage, findByIds([second.id, unknown, first.id]));
          expect(found.toSorted((left, right) => left.email.localeCompare(right.email))).toEqual([
            first,
            second,
          ]);
          expect(yield* runHost(storage, findByIds([]))).toEqual([]);
        }),
      ),
    );
  });
};
