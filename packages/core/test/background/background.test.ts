import { expect, it } from "@effect/vitest";
import { Crypto, DateTime, Effect, Layer, Schema } from "effect";
import { BackgroundProcess } from "../../src/background/process.ts";
import { BackgroundRuns } from "../../src/background/runs.ts";
import { BackgroundWakes } from "../../src/background/wakes.ts";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Fact } from "../../src/journal/fact.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Projection } from "../../src/journal/projection.ts";
import { Publication } from "../../src/journal/publication.ts";
import { Store } from "../../src/journal/store.ts";
import { Subject } from "../../src/journal/subject.ts";
import { WorkspaceId } from "../../src/workspace/id.ts";
import { Counter, make } from "../memory-store.ts";
import { testCrypto, testProvenance } from "../publication.ts";

const workspaceId = WorkspaceId.Id.make("workspace-one");
const logId = Log.Id.make("domain");
const subject = () => Subject.make("test", "entity");
const Noted = Fact.make("test.noted", {
  subject,
  version: 1,
  payload: Schema.Struct({ important: Schema.Boolean }),
});
const Counted = Fact.make("test.counted", { subject, version: 1, payload: Schema.Finite });

/** Wakes only when an important note is published. */
const settle = BackgroundProcess.make("test.settle", {
  wakesOn: [BackgroundProcess.on(Noted, (note) => note.important)],
  run: Effect.succeed(BackgroundProcess.idle),
});
/** Wakes on every note and every count. */
const tally = BackgroundProcess.make("test.tally", {
  wakesOn: [BackgroundProcess.on(Noted), BackgroundProcess.on(Counted)],
  run: Effect.succeed(BackgroundProcess.idle),
});

/** Wakes recorded with the commit that asked, or refused while `refusing` is set. */
const recordedWakes = () => {
  const requested: Array<{ readonly process: string; readonly commit: string }> = [];
  const state = { refusing: false };
  const service = BackgroundWakes.Service.of({
    request: Effect.fnUntraced(function* (process) {
      if (state.refusing)
        return yield* new Store.Failure({ operation: "wake", cause: "Wakes are refused" });
      requested.push({ process, commit: (yield* Store.Transaction).id });
    }),
  });
  return { requested, state, service };
};

const counter = Projection.make("counter", { version: 1 }).on(
  Counted,
  Effect.fn(function* (event) {
    yield* (yield* Counter).add(event.payload);
  }),
);

/**
 * Journals whose commits wake the processes, over one in-memory store: one with no projections,
 * and one that also runs a counter.
 */
const journalWith = Effect.fnUntraced(function* (wakes: BackgroundWakes.Interface) {
  const fixture = yield* make();
  const host = Layer.mergeAll(
    Layer.succeed(Store.Service, fixture.store),
    Layer.succeed(Checkpoint.Service, fixture.checkpoints),
    Layer.succeed(Counter, fixture.counter),
    Layer.succeed(BackgroundWakes.Service, wakes),
  );
  const reactions = BackgroundWakes.reactions([settle, tally]);
  return {
    fixture,
    plain: Journal.layer({ logId, projections: [], reactions }).pipe(
      Layer.provideMerge(Log.layer),
      Layer.provide(host),
    ),
    counting: Journal.layer({ logId, projections: [counter], reactions }).pipe(
      Layer.provideMerge(Log.layer),
      Layer.provide(host),
    ),
  };
});

const publishing = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.provideService(program, Publication.Service, testProvenance(workspaceId));

it.effect("a commit asks, in that commit, for each process its facts wake, once each", () =>
  Effect.gen(function* () {
    const wakes = recordedWakes();
    const { plain } = yield* journalWith(wakes.service);
    const commits = yield* Effect.gen(function* () {
      const journal = yield* Journal.Service;
      const first = yield* journal.commit(
        Effect.gen(function* () {
          const noted = yield* journal.publish(Noted, { important: true });
          yield* journal.publish(Noted, { important: false });
          yield* journal.publish(Counted, 1);
          return noted.commitId;
        }),
      );
      // An unimportant note does not wake the process that waits for important ones.
      const second = yield* journal.commit(
        Effect.map(journal.publish(Noted, { important: false }), (event) => event.commitId),
      );
      return [first, second] as const;
    }).pipe(publishing, Effect.provide(plain));
    expect(wakes.requested).toEqual([
      { process: "test.settle", commit: commits[0] },
      { process: "test.tally", commit: commits[0] },
      { process: "test.tally", commit: commits[1] },
    ]);
  }),
);

it.effect("a wake that cannot be stored fails the commit, which publishes nothing", () =>
  Effect.gen(function* () {
    const wakes = recordedWakes();
    wakes.state.refusing = true;
    const { plain } = yield* journalWith(wakes.service);
    const outcome = yield* Effect.gen(function* () {
      const journal = yield* Journal.Service;
      const failure = yield* Effect.flip(journal.commit(journal.publish(Counted, 1)));
      return { failure, entries: yield* journal.log.read({ limit: 10 }) };
    }).pipe(publishing, Effect.provide(plain));
    expect(outcome.failure).toMatchObject({ _tag: "JournalStore.Failure", operation: "wake" });
    expect(outcome.entries).toEqual([]);
  }),
);

it.effect("a retried publication and a projection's rebuild wake nothing again", () =>
  Effect.gen(function* () {
    const wakes = recordedWakes();
    const { plain, counting, fixture } = yield* journalWith(wakes.service);
    const once = { idempotencyKey: Store.IdempotencyKey.make("count-once") };
    yield* Effect.gen(function* () {
      const journal = yield* Journal.Service;
      yield* journal.commit(journal.publish(Counted, 2, once));
      yield* journal.commit(journal.publish(Counted, 2, once));
    }).pipe(publishing, Effect.provide(plain));
    expect(wakes.requested.map((wake) => wake.process)).toEqual(["test.tally"]);
    // A journal that also runs a counter rebuilds it from the log, applying the count again.
    yield* Effect.flatMap(Journal.Service, (journal) => journal.replay).pipe(
      Effect.provide(counting),
    );
    expect(yield* fixture.counter.get).toBe(2);
    expect(wakes.requested.map((wake) => wake.process)).toEqual(["test.tally"]);
  }),
);

const runsWith = <E, R>(processes: ReadonlyArray<BackgroundProcess.Definition<E, R>>) =>
  Effect.gen(function* () {
    const wakes = recordedWakes();
    const { plain } = yield* journalWith(wakes.service);
    return BackgroundRuns.layer(processes).pipe(
      Layer.provideMerge(plain),
      Layer.provide(Layer.succeed(Crypto.Crypto, testCrypto)),
    );
  });

it.effect("a run acts as its process and reports what it left outstanding", () =>
  Effect.gen(function* () {
    const later = DateTime.makeUnsafe("2026-09-25T09:00:00.000Z");
    const counting = BackgroundProcess.make("test.count", {
      wakesOn: [],
      run: Effect.gen(function* () {
        const journal = yield* Journal.Service;
        yield* journal.commit(journal.publish(Counted, 5));
        return BackgroundProcess.dueAt(later);
      }),
    });
    const outcome = yield* Effect.gen(function* () {
      const backgroundRuns = yield* BackgroundRuns.Service;
      expect(backgroundRuns.names).toEqual(["test.count"]);
      const outcome = yield* backgroundRuns.run("test.count");
      const [batch] = yield* (yield* Journal.Service).log.read({ limit: 1 });
      return { outcome, performer: batch?.entries[0]?.payload.provenance.performedBy };
    }).pipe(Effect.provide(yield* runsWith([counting])));
    expect(outcome).toEqual({
      outcome: BackgroundProcess.dueAt(later),
      performer: { _tag: "System", id: "test.count" },
    });
  }),
);

it.effect("a run of an unknown or failing process reports which", () =>
  Effect.gen(function* () {
    class Stuck extends Schema.TaggedError<Stuck>()("BackgroundTest.Stuck", {}) {}
    const failing = BackgroundProcess.make("test.fail", {
      wakesOn: [],
      run: Effect.fail(new Stuck()),
    });
    const failures = yield* Effect.gen(function* () {
      const backgroundRuns = yield* BackgroundRuns.Service;
      return [
        yield* Effect.flip(backgroundRuns.run("test.missing")),
        yield* Effect.flip(backgroundRuns.run("test.fail")),
      ];
    }).pipe(Effect.provide(yield* runsWith([failing])));
    expect(failures).toEqual([
      new BackgroundRuns.Unknown({ process: "test.missing" }),
      new BackgroundRuns.Failure({ process: "test.fail", cause: new Stuck() }),
    ]);
  }),
);

it.effect("two processes may not share a name", () =>
  Effect.gen(function* () {
    const failure = yield* Effect.flip(
      Layer.build(yield* runsWith([tally, tally])).pipe(Effect.scoped),
    );
    expect(failure).toEqual(new BackgroundRuns.Duplicate({ process: "test.tally" }));
  }),
);

it("process names are dotted and owned by a domain", () => {
  expect(() =>
    BackgroundProcess.make("settle", { wakesOn: [], run: Effect.succeed(BackgroundProcess.idle) }),
  ).toThrow();
  expect(
    BackgroundProcess.make("notification.settle", {
      wakesOn: [],
      run: Effect.succeed(BackgroundProcess.idle),
    }).name,
  ).toBe("notification.settle");
});
