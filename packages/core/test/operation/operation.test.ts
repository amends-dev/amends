import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Option, Result, Schema } from "effect";
import * as CoreError from "../../src/error/CoreError.ts";
import * as Commit from "../../src/journal/Commit.ts";
import * as Entry from "../../src/journal/Entry.ts";
import * as Projection from "../../src/journal/Projection.ts";
import * as Store from "../../src/journal/Store.ts";
import * as StoreError from "../../src/journal/StoreError.ts";
import * as Operation from "../../src/operation/Operation.ts";
import * as MemberId from "../../src/workspace/MemberId.ts";

/** The defect an exit died with, which must carry no failure. */
const defect = <A, E>(exit: Exit.Exit<A, E>): unknown => {
  if (!Exit.isFailure(exit)) throw new Error("Expected a failed exit");
  const found = Cause.findDie(exit.cause);
  if (!Result.isSuccess(found)) throw new Error("Expected a defect");
  expect(Option.isNone(Cause.findErrorOption(exit.cause))).toBe(true);
  return found.success.defect;
};
const reported = <E>(error: E) => Effect.flip(Operation.report(Effect.fail(error)));
const key = { logId: Entry.LogId.make("journal"), name: "projection", version: 1 };

it.effect("an operation reports its kinds as they are", () =>
  Effect.gen(function* () {
    const missing = new CoreError.NotFound({ resource: "Member", id: MemberId.Id.make("m") });
    expect(yield* reported(missing)).toBe(missing);
  }),
);

it.effect("storage another writer held, and read models being rebuilt, are Unavailable", () =>
  Effect.gen(function* () {
    expect(
      yield* reported(StoreError.contended("Store", "append", "Changed position")),
    ).toMatchObject({
      _tag: "CoreError.Unavailable",
      reason: { _tag: "Contention", operation: "append", description: "Changed position" },
    });
    for (const stale of [new Projection.Behind({ key }), new Projection.Unregistered({ key })])
      expect(yield* reported(stale)).toMatchObject({
        _tag: "CoreError.Unavailable",
        reason: { _tag: "Reloading" },
      });
  }),
);

it.effect("a commit storage could not confirm is Uncertain, without storage's detail", () =>
  Effect.gen(function* () {
    const uncertain = yield* reported(
      new Store.CommitUncertain({
        commitId: Commit.Id.make("commit"),
        cause: new Error("driver detail"),
      }),
    );
    expect(yield* Schema.encodeEffect(CoreError.CoreError)(uncertain)).toEqual({
      _tag: "CoreError.Uncertain",
      commitId: "commit",
    });
  }),
);

it.effect("a value that does not decode is Invalid", () =>
  Effect.gen(function* () {
    const invalid = yield* Effect.flip(
      Operation.report(Schema.decodeEffect(Schema.NonEmptyString)("")),
    );
    expect(invalid).toMatchObject({ _tag: "CoreError.Invalid", reason: { _tag: "Malformed" } });
  }),
);

it.effect("storage that failed otherwise, and a kind that does not hold, are defects", () =>
  Effect.gen(function* () {
    const failure = StoreError.failed("MemberStore", "get")(new Error("database detail"));
    expect(defect(yield* Effect.exit(Operation.report(Effect.fail(failure))))).toBe(failure);
    const malformed = { _tag: "CoreError.NotFound", resource: "Member", id: 42 };
    expect(defect(yield* Effect.exit(Operation.report(Effect.fail(malformed))))).toBe(malformed);
    const interrupted = yield* Effect.exit(Operation.report(Effect.interrupt));
    expect(Exit.hasInterrupts(interrupted)).toBe(true);
    expect(Exit.hasDies(interrupted)).toBe(false);
  }),
);
