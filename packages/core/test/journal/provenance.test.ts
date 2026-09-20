import { expect, test } from "bun:test";
import { Crypto, DateTime, Effect, Option, Schema, Stream } from "effect";
import { Actor } from "../../src/identity/actor.ts";
import { Identity } from "../../src/identity/identity.ts";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Codec } from "../../src/journal/codec.ts";
import { CommittedEvents } from "../../src/journal/committed-events.ts";
import { Entry } from "../../src/journal/entry.ts";
import { Event } from "../../src/journal/event.ts";
import { Fact } from "../../src/journal/fact.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Projection } from "../../src/journal/projection.ts";
import { Publication } from "../../src/journal/publication.ts";
import { Store } from "../../src/journal/store.ts";
import { Transaction } from "../../src/journal/transaction.ts";
import { WorkspaceId } from "../../src/workspace/id.ts";
import { MemberId } from "../../src/workspace/member/id.ts";
import { make, type Fixture } from "../memory-store.ts";
import { testCrypto, testProvenance } from "../publication.ts";

const workspaceId = WorkspaceId.Id.make("workspace-one");
const logId = Log.Id.make("journal");
const Changed = Fact.make("example.changed", { version: 1, payload: Schema.Finite });
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    Log.Service | Transaction.Service | Checkpoint.Service | CommittedEvents.Service | Crypto.Crypto
  >,
) =>
  Effect.runPromise(
    program.pipe(
      Effect.provide(Log.layer),
      Effect.provideService(Store.Service, fixture.store),
      Effect.provideService(Checkpoint.Service, fixture.checkpoints),
      Effect.provide(CommittedEvents.layer(workspaceId)),
      Effect.provideService(Crypto.Crypto, testCrypto),
    ),
  );
const setup = Journal.make({ logId, projections: [] });

test("root operations have independent correlations and attribute an agent's own identity", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const actor = Actor.Value.make({
        workspaceId,
        memberId: MemberId.Id.make("agent-membership"),
        identity: Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make("agent") }),
      });
      const occurredAt = DateTime.makeUnsafe("2025-01-01T00:00:00Z");
      const attribution = Publication.makeForActor(occurredAt).pipe(
        Effect.provideService(Actor.Service, actor),
      );
      const [one, two] = yield* Effect.all([attribution, attribution], {
        concurrency: "unbounded",
      });
      expect(one.correlationId).not.toBe(two.correlationId);
      const journal = yield* setup;
      const events = yield* journal.commit(
        Effect.all([journal.publish(Changed, 1, one), journal.publish(Changed, 2, one)]),
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
});

test("causation survives commits and can change performer while preserving correlation", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* setup;
      const parent = yield* journal.publish(Changed, 1, testProvenance(workspaceId));
      const human = {
        _tag: "Identity",
        identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") }),
      } as const;
      const next = yield* Publication.makeCausedBy(parent, human);
      const child = yield* journal.publish(Changed, 2, next);
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
});

test("missing attribution, foreign workspaces, dangling causes and changed correlations reject writes", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* setup;
      // @ts-expect-error New publications must supply provenance, including from JavaScript callers.
      expect((yield* Effect.flip(journal.publish(Changed, 0)))._tag).toBe("SchemaError");
      const parent = yield* journal.publish(Changed, 1, testProvenance(workspaceId));
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
        expect((yield* Effect.flip(journal.publish(Changed, 2, provenance)))._tag).toBe(
          "SchemaError",
        );
      }
      const failure = yield* Effect.flip(
        journal.commit(
          Effect.gen(function* () {
            yield* journal.publish(Changed, 3, testProvenance(workspaceId));
            yield* journal
              .publish(
                Changed,
                4,
                Object.assign({}, next, {
                  causedBy: Object.assign({}, cause, { id: Entry.Id.make("missing") }),
                }),
              )
              .pipe(Effect.ignore);
          }),
        ),
      );
      expect(failure._tag).toBe("Commit.Aborted");
      expect(
        (yield* journal.log.read({ limit: 10 })).flatMap((batch) => batch.entries),
      ).toHaveLength(1);
    }),
  );
});

test("old binary envelopes remain readable and replay preserves original attribution without a current actor", async () => {
  const fixture = await Effect.runPromise(make());
  let published: Event.Record | undefined;
  await run(
    fixture,
    Effect.gen(function* () {
      const logs = yield* Log.Service;
      const legacy = logs.open({
        id: logId,
        schema: Schema.Struct({
          name: Schema.String,
          version: Schema.Finite,
          payload: Schema.Uint8Array,
        }),
      });
      yield* legacy.append({
        name: Changed.name,
        version: Changed.version,
        payload: yield* Codec.make(Changed).encode(1),
      });
      published = yield* (yield* setup).publish(Changed, 2, testProvenance(workspaceId));
    }),
  );
  await run(
    fixture,
    Effect.gen(function* () {
      const seen: Event.Record[] = [];
      const projection = Projection.make("provenance", { version: 1 }).on(Changed, (event) =>
        Effect.sync(() => {
          seen.push(event);
        }),
      );
      const journal = yield* Journal.make({ logId, projections: [projection] });
      yield* journal.replay;
      expect(seen).toHaveLength(2);
      expect(seen[0]?.provenance).toBeNull();
      expect(seen[1]).toEqual(published);
      const bytesBefore = (yield* fixture.snapshot).logs.get(logId);
      yield* journal.replay;
      expect(seen).toHaveLength(2);
      expect((yield* fixture.snapshot).logs.get(logId)).toEqual(bytesBefore);
    }),
  );
});

test("publication owns nested attribution before projections and committed delivery", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
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
      const stream = yield* (yield* CommittedEvents.Service).subscribe;
      const event = yield* journal.publish(Changed, 1, provenance);
      const batch = (yield* stream.pipe(Stream.take(1), Stream.runCollect))[0];
      expect(event.provenance).not.toBe(provenance);
      expect(Object.isFrozen(event.provenance)).toBe(true);
      if (event.provenance.performedBy._tag === "System")
        return yield* Effect.die("Expected identity");
      expect(event.provenance.performedBy.identity).not.toBe(identity);
      expect(Object.isFrozen(event.provenance.performedBy.identity)).toBe(true);
      identity.id = Identity.HumanId.make("changed-after-publication");
      expect(event.provenance.performedBy.identity.id).toBe(Identity.HumanId.make("alice"));
      expect(batch?.events[0]?.provenance).toEqual(event.provenance);
      expect(Object.isFrozen(batch?.events[0]?.provenance?.performedBy)).toBe(true);
    }).pipe(Effect.scoped),
  );
});
