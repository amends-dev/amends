import { expect, it } from "@effect/vitest";
import { Context, Effect, Layer, Schema } from "effect";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Fact } from "../../src/journal/fact.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Projection } from "../../src/journal/projection.ts";
import { Publication } from "../../src/journal/publication.ts";
import type { Reaction } from "../../src/journal/reaction.ts";
import { Store } from "../../src/journal/store.ts";
import { Subject } from "../../src/journal/subject.ts";
import { WorkspaceId } from "../../src/workspace/id.ts";
import { Counter, make } from "../memory.ts";
import { testProvenance } from "../publication.ts";

const workspaceId = WorkspaceId.Id.make("workspace-one");
const logId = Log.Id.make("domain");
const subject = () => Subject.make("test", "entity");
const Noted = Fact.make("test.noted", {
  subject,
  version: 1,
  payload: Schema.Struct({ important: Schema.Boolean }),
});
const Counted = Fact.make("test.counted", { subject, version: 1, payload: Schema.Finite });

/** Where reactions record what they saw, as a host's job requests would be stored. */
class Requests extends Context.Service<
  Requests,
  {
    readonly record: (request: string) => Effect.Effect<void, Store.Failure, Store.Transaction>;
  }
>()("test/Requests") {}

/** Requests recorded with the commit that made them, or refused while `refusing` is set. */
const recordedRequests = () => {
  const requested: Array<{ readonly request: string; readonly commit: string }> = [];
  const state = { refusing: false };
  const service = Requests.of({
    record: Effect.fnUntraced(function* (request) {
      if (state.refusing)
        return yield* new Store.Failure({ operation: "record request", cause: "Refused" });
      requested.push({ request, commit: (yield* Store.Transaction).id });
    }),
  });
  return { requested, state, service };
};

/** An important note asks for settling; every count asks for a tally. */
const reactions: ReadonlyArray<Reaction.Definition<Requests>> = [
  {
    fact: Noted.name,
    react: (event) =>
      (event.payload as { readonly important: boolean }).important
        ? Effect.flatMap(Requests, (requests) => requests.record("settle"))
        : Effect.void,
  },
  {
    fact: Counted.name,
    react: () => Effect.flatMap(Requests, (requests) => requests.record("tally")),
  },
];

const counter = Projection.make("counter", { version: 1 }).on(
  Counted,
  Effect.fn(function* (event) {
    yield* (yield* Counter).add(event.payload);
  }),
);

/**
 * Journals with the reactions over one in-memory store: one with no projections, and one that also
 * runs a counter.
 */
const journalWith = Effect.fnUntraced(function* (requests: Context.Service.Shape<typeof Requests>) {
  const fixture = yield* make();
  const host = Layer.mergeAll(
    Layer.succeed(Store.Service, fixture.store),
    Layer.succeed(Checkpoint.Service, fixture.checkpoints),
    Layer.succeed(Counter, fixture.counter),
    Layer.succeed(Requests, requests),
  );
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

it.effect("a commit runs the reactions to each fact it publishes, in that commit", () =>
  Effect.gen(function* () {
    const requests = recordedRequests();
    const { plain } = yield* journalWith(requests.service);
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
      const second = yield* journal.commit(
        Effect.map(journal.publish(Counted, 2), (event) => event.commitId),
      );
      return [first, second] as const;
    }).pipe(publishing, Effect.provide(plain));
    expect(requests.requested).toEqual([
      { request: "settle", commit: commits[0] },
      { request: "tally", commit: commits[0] },
      { request: "tally", commit: commits[1] },
    ]);
  }),
);

it.effect("a reaction that fails fails the commit, which publishes nothing", () =>
  Effect.gen(function* () {
    const requests = recordedRequests();
    requests.state.refusing = true;
    const { plain } = yield* journalWith(requests.service);
    const outcome = yield* Effect.gen(function* () {
      const journal = yield* Journal.Service;
      const failure = yield* Effect.flip(journal.commit(journal.publish(Counted, 1)));
      return { failure, entries: yield* journal.log.read({ limit: 10 }) };
    }).pipe(publishing, Effect.provide(plain));
    expect(outcome.failure).toMatchObject({
      _tag: "JournalStore.Failure",
      operation: "record request",
    });
    expect(outcome.entries).toEqual([]);
  }),
);

it.effect("a retried publication and a projection's rebuild run no reaction again", () =>
  Effect.gen(function* () {
    const requests = recordedRequests();
    const { plain, counting, fixture } = yield* journalWith(requests.service);
    const once = { idempotencyKey: Store.IdempotencyKey.make("count-once") };
    yield* Effect.gen(function* () {
      const journal = yield* Journal.Service;
      yield* journal.commit(journal.publish(Counted, 2, once));
      yield* journal.commit(journal.publish(Counted, 2, once));
    }).pipe(publishing, Effect.provide(plain));
    expect(requests.requested.map(({ request }) => request)).toEqual(["tally"]);
    // A journal that also runs a counter rebuilds it from the log, applying the count again.
    yield* Effect.flatMap(Journal.Service, (journal) => journal.replay).pipe(
      Effect.provide(counting),
    );
    expect(yield* fixture.counter.get).toBe(2);
    expect(requests.requested.map(({ request }) => request)).toEqual(["tally"]);
  }),
);
