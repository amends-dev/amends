import * as Performer from "../../src/identity/Performer.ts";
import { Subject } from "@amends-dev/core/journal";
import { expect, expectTypeOf, it } from "@effect/vitest";
import { Cause, Context, Crypto, DateTime, Deferred, Effect, Exit, Option, Schema } from "effect";
import * as Actor from "../../src/identity/Actor.ts";
import * as Identity from "../../src/identity/Identity.ts";
import * as Checkpoint from "../../src/journal/Checkpoint.ts";
import * as Entry from "../../src/journal/Entry.ts";
import * as Event from "../../src/journal/Event.ts";
import * as Fact from "../../src/journal/Fact.ts";
import * as Journal from "../../src/journal/Journal.ts";
import * as Log from "../../src/journal/Log.ts";
import * as Projection from "../../src/journal/Projection.ts";
import * as Publication from "../../src/journal/Publication.ts";
import * as Store from "../../src/journal/Store.ts";
import * as Transaction from "../../src/journal/Transaction.ts";
import * as WorkspaceId from "../../src/workspace/WorkspaceId.ts";
import * as MemberId from "../../src/workspace/MemberId.ts";
import { make, type Fixture } from "../memory.ts";
import { testCrypto, testProvenance } from "../publication.ts";

const testSubject = () => Subject.make("test", "entity");
const workspaceId = WorkspaceId.Id.make("workspace-one");
const logId = Entry.LogId.make("journal");
const Changed = Fact.make("example.changed", {
  subject: testSubject,
  version: 1,
  payload: Schema.Finite,
});
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    Log.Log | Transaction.Transaction | Checkpoint.Checkpoint | Crypto.Crypto
  >,
) =>
  program.pipe(
    Effect.provide(Log.layer),
    Effect.provideService(Store.Store, fixture.store),
    Effect.provideService(Checkpoint.Checkpoint, fixture.checkpoints),
    Effect.provideService(Crypto.Crypto, testCrypto),
  );
const setup = Journal.make({ logId, projections: [] });
it.effect(
  "root operations have independent correlations and attribute an agent's own identity",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const actor = Actor.Actor.of({
            workspaceId,
            memberId: MemberId.Id.make("agent-membership"),
            identity: Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make("agent") }),
          });
          const occurredAt = DateTime.makeUnsafe("2025-01-01T00:00:00Z");
          const attribution = Publication.makeForActor(occurredAt).pipe(
            Effect.provideService(Actor.Actor, actor),
          );
          const [one, two] = yield* Effect.all([attribution, attribution], {
            concurrency: "unbounded",
          });
          expect(one.correlationId).not.toBe(two.correlationId);
          const journal = yield* setup;
          const events = yield* journal.commit(
            Effect.all([
              journal.publish(Changed, 1).pipe(Effect.provideService(Publication.Publication, one)),
              journal.publish(Changed, 2).pipe(Effect.provideService(Publication.Publication, one)),
            ]),
          );
          for (const event of events) {
            expect(event.provenance).toEqual({
              workspaceId,
              performedBy: { _tag: "Member", memberId: actor.memberId, identity: actor.identity },
              causedBy: null,
              correlationId: one.correlationId,
              occurredAt,
            });
            expect(DateTime.toEpochMillis(event.recordedAt)).not.toBe(
              DateTime.toEpochMillis(occurredAt),
            );
          }
          expect(events[0]?.commitId).toBe(events[1]?.commitId);
        }),
      );
    }),
);

it.effect("causation survives commits and can change performer while preserving correlation", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* run(
      fixture,
      Effect.gen(function* () {
        const journal = yield* setup;
        const parent = yield* journal
          .publish(Changed, 1)
          .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
        const human = {
          _tag: "Identity",
          identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") }),
        } as const;
        const next = yield* Publication.makeCausedBy(parent, human);
        const child = yield* journal
          .publish(Changed, 2)
          .pipe(Effect.provideService(Publication.Publication, next));
        expect(child.commitId).not.toBe(parent.commitId);
        expect(child.provenance).toMatchObject({
          performedBy: human,
          causedBy: Event.makeReference(parent),
          correlationId: parent.provenance.correlationId,
        });
        const batch = yield* journal.log.get(child.commitId);
        if (Option.isNone(batch) || batch.value.entries[0] === undefined)
          return yield* Effect.die("Missing event");
        expect(yield* Event.decode(Changed, batch.value.entries[0])).toEqual(child);
      }),
    );
  }),
);

it.effect(
  "publication requires invocation context even if an actor or construction context exists",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      const journal = yield* run(
        fixture,
        setup.pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId))),
      );
      const publish = journal.publish(Changed, 0).pipe(
        Effect.provideService(Actor.Actor, {
          workspaceId,
          memberId: MemberId.Id.make("alice"),
          identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") }),
        }),
      );
      expectTypeOf<Effect.Services<typeof publish>>().toEqualTypeOf<Publication.Publication>();
      // An intentionally incomplete runtime context models a JavaScript caller bypassing the type check.
      const exit = yield* Effect.exit(
        publish.pipe(Effect.provide(Context.makeUnsafe<Publication.Publication>(new Map()))),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(Cause.pretty(exit.cause)).toContain("@amends-dev/core/journal/Publication");
      expect((yield* fixture.snapshot).logs.size).toBe(0);
    }),
);

it.effect("foreign workspaces, dangling causes and changed correlations reject writes", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* run(
      fixture,
      Effect.gen(function* () {
        const journal = yield* setup;
        const parent = yield* journal
          .publish(Changed, 1)
          .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
        const next = yield* Publication.makeCausedBy(parent);
        const cause = Event.makeReference(parent);
        const invalid = [
          Object.assign({}, next, { workspaceId: WorkspaceId.Id.make("other") }),
          Object.assign({}, next, {
            causedBy: Object.assign({}, cause, { workspaceId: WorkspaceId.Id.make("other") }),
          }),
          Object.assign({}, next, {
            causedBy: Object.assign({}, cause, { id: Entry.Id.make("missing") }),
          }),
          Object.assign({}, next, { correlationId: Event.CorrelationId.make("unrelated") }),
        ];
        for (const provenance of invalid) {
          expect(
            (yield* Effect.flip(
              journal
                .publish(Changed, 2)
                .pipe(Effect.provideService(Publication.Publication, provenance)),
            ))._tag,
          ).toBe("SchemaError");
        }
        const failure = yield* Effect.flip(
          journal.commit(
            Effect.gen(function* () {
              yield* journal
                .publish(Changed, 3)
                .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
              yield* journal.publish(Changed, 4).pipe(
                Effect.provideService(
                  Publication.Publication,
                  Object.assign({}, next, {
                    causedBy: Object.assign({}, cause, { id: Entry.Id.make("missing") }),
                  }),
                ),
                Effect.ignore,
              );
            }),
          ),
        );
        expect(failure._tag).toBe("Commit.Aborted");
        expect(
          (yield* journal.log.read({ limit: 10 })).flatMap((batch) => batch.entries),
        ).toHaveLength(1);
      }),
    );
  }),
);

it.effect("replay preserves recorded attribution without a current publication context", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    const published = yield* run(
      fixture,
      Effect.gen(function* () {
        return yield* (yield* setup)
          .publish(Changed, 2)
          .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
      }),
    );
    yield* run(
      fixture,
      Effect.gen(function* () {
        const seen: Event.Event[] = [];
        const projection = Projection.make("provenance", { version: 1 }).on(Changed, (event) =>
          Effect.sync(() => {
            seen.push(event);
          }),
        );
        const journal = yield* Journal.make({ logId, projections: [projection] });
        yield* journal.replay;
        expect(seen).toEqual([published]);
        yield* journal.replay;
        expect(seen).toEqual([published]);
      }),
    );
  }),
);

it.effect("publication owns nested attribution before projections and committed delivery", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* run(
      fixture,
      Effect.gen(function* () {
        const identity: { _tag: "Human"; id: Identity.HumanId } = {
          _tag: "Human",
          id: Identity.HumanId.make("alice"),
        };
        const provenance = Object.assign({}, testProvenance(workspaceId), {
          performedBy: { _tag: "Identity", identity } as const,
        });
        const journal = yield* setup;
        const event = yield* journal
          .publish(Changed, 1)
          .pipe(Effect.provideService(Publication.Publication, provenance));
        expect(event.provenance).not.toBe(provenance);
        expect(Object.isFrozen(event.provenance)).toBe(true);
        if (Performer.Reference.isAnyOf(["System"])(event.provenance.performedBy))
          return yield* Effect.die("Expected identity");
        expect(event.provenance.performedBy.identity).not.toBe(identity);
        expect(Object.isFrozen(event.provenance.performedBy.identity)).toBe(true);
        identity.id = Identity.HumanId.make("changed-after-publication");
        expect(event.provenance.performedBy.identity.id).toBe(Identity.HumanId.make("alice"));
        const [stored] = (yield* journal.log.read({ limit: 1 }))[0]?.entries ?? [];
        expect(stored?.payload.provenance).toEqual(event.provenance);
      }).pipe(Effect.scoped),
    );
  }),
);

it.effect(
  "concurrent operation contexts keep their actors and correlations through nested operations",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const journal = yield* setup;
          const alice = Actor.Actor.of({
            workspaceId,
            memberId: MemberId.Id.make("alice"),
            identity: { _tag: "Human", id: Identity.HumanId.make("alice") },
          });
          const bob = Actor.Actor.of({
            workspaceId,
            memberId: MemberId.Id.make("bob"),
            identity: { _tag: "Agent", id: Identity.AgentId.make("bob") },
          });
          const aliceReady = yield* Deferred.make<void>();
          const bobReady = yield* Deferred.make<void>();
          const operation = (
            actor: Actor.Actor["Service"],
            other: Actor.Actor["Service"],
            ready: Deferred.Deferred<void>,
            otherReady: Deferred.Deferred<void>,
          ) =>
            Effect.gen(function* () {
              const original = yield* Publication.Publication;
              yield* Deferred.succeed(ready, undefined);
              yield* Deferred.await(otherReady);
              const first = yield* journal.publish(Changed, 1);
              // A temporary authorization actor must not replace the operation's publication context.
              const nested = yield* journal
                .publish(Changed, 2)
                .pipe(Publication.withActor, Effect.provideService(Actor.Actor, other));
              const last = yield* journal.publish(Changed, 3);
              expect(yield* Publication.Publication).toEqual(original);
              for (const event of [first, nested, last]) {
                expect(event.provenance).toEqual(original);
                expect(event.provenance.performedBy).toEqual({
                  _tag: "Member",
                  memberId: actor.memberId,
                  identity: actor.identity,
                });
              }
              return [first, nested, last] as const;
            }).pipe(Publication.withActor, Effect.provideService(Actor.Actor, actor));
          const [first, second] = yield* journal.commit(
            Effect.all(
              [
                operation(alice, bob, aliceReady, bobReady),
                operation(bob, alice, bobReady, aliceReady),
              ],
              { concurrency: "unbounded" },
            ),
          );
          expect(first[0].commitId).toBe(second[0].commitId);
          expect(first[0].provenance.correlationId).not.toBe(second[0].provenance.correlationId);
          expect(Option.isNone(yield* Effect.serviceOption(Publication.Publication))).toBe(true);
        }),
      );
    }),
);

it.effect(
  "causal and field overrides retain the current performer and restore context after success and failure",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const journal = yield* setup;
          const parent = yield* journal
            .publish(Changed, 1)
            .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
          const actor = Actor.Actor.of({
            workspaceId,
            memberId: MemberId.Id.make("worker"),
            identity: { _tag: "Agent", id: Identity.AgentId.make("worker") },
          });
          const time = DateTime.makeUnsafe("2025-01-01T00:00:00Z");
          yield* Effect.gen(function* () {
            const original = yield* Publication.Publication;
            const child = yield* journal
              .publish(Changed, 2)
              .pipe(Publication.withCause(parent, time));
            expect(child.provenance.performedBy).toEqual(original.performedBy);
            expect(child.provenance.causedBy).toEqual(Event.makeReference(parent));
            expect(child.provenance.correlationId).toBe(parent.provenance.correlationId);
            expect(child.provenance.occurredAt).toEqual(time);
            expect(yield* Publication.Publication).toEqual(original);
            const temporary = testProvenance(workspaceId).performedBy;
            const failure = yield* Effect.gen(function* () {
              const changed = yield* Publication.Publication;
              expect(changed.performedBy).toEqual(temporary);
              expect(changed.occurredAt).toEqual(time);
              expect(changed.causedBy).toEqual(Event.makeReference(parent));
              expect(changed.correlationId).toBe(parent.provenance.correlationId);
              return yield* Effect.fail("expected failure");
            }).pipe(
              Publication.withPerformer(temporary),
              Publication.withOccurredAt(time),
              Publication.withCause(parent),
              Effect.flip,
            );
            expect(failure).toBe("expected failure");
            expect(yield* Publication.Publication).toEqual(original);
            const after = yield* journal.publish(Changed, 3);
            expect(after.provenance).toEqual(original);
            expect(after.provenance.correlationId).not.toBe(child.provenance.correlationId);
            expect(after.provenance.causedBy).toBeNull();
          }).pipe(Publication.withActor, Effect.provideService(Actor.Actor, actor));
          expect(Option.isNone(yield* Effect.serviceOption(Publication.Publication))).toBe(true);
        }),
      );
    }),
);

it.effect("a scoped cause cannot switch the current publication workspace", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* run(
      fixture,
      Effect.gen(function* () {
        const journal = yield* setup;
        const parent = yield* journal
          .publish(Changed, 1)
          .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
        const failure = yield* journal
          .publish(Changed, 2)
          .pipe(
            Publication.withCause(parent),
            Effect.provideService(
              Publication.Publication,
              testProvenance(WorkspaceId.Id.make("other")),
            ),
            Effect.flip,
          );
        expect(failure._tag).toBe("SchemaError");
        expect(
          (yield* journal.log.read({ limit: 10 })).flatMap((batch) => batch.entries),
        ).toHaveLength(1);
      }),
    );
  }),
);
