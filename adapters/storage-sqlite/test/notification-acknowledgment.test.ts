import type * as Core from "@amends/core";
import { expect, expectTypeOf, it } from "@effect/vitest";
import { GroupApplication, GroupMembershipApplication } from "@amends/core/group";
import { Actor, Identity } from "@amends/core/identity";
import { Checkpoint, Event, Journal, Log, Publication, Store } from "@amends/core/journal";
import {
  Notification,
  NotificationAcknowledgment,
  NotificationApplication,
  NotificationFacts,
  NotificationProjection,
  NotificationStore,
} from "@amends/core/notification";
import {
  ThreadApplication,
  ThreadParticipation,
  ThreadParticipationApplication,
} from "@amends/core/thread";
import { Member, MemberApplication, MemberFacts } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Cause, Context, DateTime, Deferred, Effect, Exit, Fiber, Option } from "effect";
import { TestClock } from "effect/testing";
import { SqlClient } from "effect/unstable/sql";
import {
  temporary as withDatabase,
  boundTo,
  core,
  host,
  initialized,
  inDatabase,
  type Bound,
  workspaceId,
  otherWorkspaceId,
  testProvenance,
} from "./support.ts";

const human: Actor.Value = {
  workspaceId,
  memberId: Member.Id.make("human"),
  identity: { _tag: "Human", id: Identity.HumanId.make("recipient") },
};
const agent: Actor.Value = {
  workspaceId,
  memberId: Member.Id.make("agent"),
  identity: { _tag: "Agent", id: Identity.AgentId.make("recipient") },
};
const run = <A, E, R>(bound: Bound, actor: Actor.Value, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(Actor.Service, actor), Effect.provide(core(bound)));
const facts = <A, E, R>(bound: Bound, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provideService(Publication.Service, testProvenance()),
    Effect.provide(core(bound)),
  );
const ack = (id: Notification.Id) =>
  Effect.flatMap(NotificationApplication.Service, (s) => s.acknowledge(id));
const resolve = (id: Notification.Id) =>
  Effect.flatMap(NotificationApplication.Service, (s) => s.resolveSource(id));
const notes = (bound: Bound, identity: Notification.Recipient) =>
  bound.notifications.listByRecipient(identity, { limit: 100 });
const history = (bound: Bound) => bound.store.read(Log.Id.make("journal"), { limit: 100 });
const key = {
  logId: Log.Id.make("journal"),
  name: NotificationProjection.definition.name,
  version: NotificationProjection.definition.version,
};
const seen: Notification.Acknowledgment = {
  outcome: { _tag: "Seen" },
  acknowledgedAt: DateTime.makeUnsafe("2026-09-21T12:00:00.123Z"),
};
const changed = <A extends object>(record: A, changes: Partial<A>): A =>
  Object.assign({}, record, changes);
const prepare = Effect.fnUntraced(function* () {
  const bound = yield* boundTo(workspaceId);
  const workspace = yield* initialized(bound);
  const owner: Actor.Value = {
    workspaceId,
    memberId: workspace.ownerMemberId,
    identity: { _tag: "Human", id: workspace.createdBy },
  };
  yield* facts(
    bound,
    Effect.flatMap(Journal.Service, (journal) =>
      journal.commit(
        Effect.forEach([human, agent], (actor) =>
          journal.publish(MemberFacts.Added, {
            workspaceId,
            memberId: actor.memberId,
            identity: actor.identity,
          }),
        ),
      ),
    ),
  );
  const group = yield* run(
    bound,
    owner,
    Effect.flatMap(GroupApplication.Service, (s) =>
      s.createPrivateTeam({
        name: "Team",
        memberIds: [owner.memberId, human.memberId, agent.memberId],
      }),
    ),
  );
  const first = yield* run(
    bound,
    owner,
    Effect.flatMap(ThreadApplication.Service, (s) =>
      // Mentioning everyone, the author included, enrolls and notifies all three.
      s.startInGroup({
        groupId: group.id,
        mentions: [owner.memberId, human.memberId, agent.memberId],
        text: "Proposal",
      }),
    ),
  );
  const humanNote = (yield* notes(bound, human.identity))[0];
  const agentNote = (yield* notes(bound, agent.identity))[0];
  const ownerNote = (yield* notes(bound, owner.identity))[0];
  if (!humanNote || !agentNote || !ownerNote)
    return yield* Effect.die("Missing generated notifications");
  return { bound, owner, group, first, humanNote, agentNote, ownerNote };
});
const snapshot = Effect.fnUntraced(function* (p: Effect.Success<ReturnType<typeof prepare>>) {
  return {
    history: yield* history(p.bound),
    checkpoint: yield* p.bound.checkpoints.get(key),
    human: yield* notes(p.bound, human.identity),
    agent: yield* notes(p.bound, agent.identity),
    owner: yield* notes(p.bound, p.owner.identity),
    activity: yield* p.bound.activities.listByThread(p.first.thread.id),
    participation: yield* p.bound.participations.listByThread(p.first.thread.id),
  };
});

it.effect(
  "human acknowledgment records one fact and stable timestamp, preserves history, and never creates activity",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          expectTypeOf<
            Extract<Core.Operations, NotificationAcknowledgment.Service>
          >().toEqualTypeOf<never>();
          expectTypeOf<
            Effect.Services<ReturnType<NotificationAcknowledgment.Interface["record"]>>
          >().toEqualTypeOf<Store.Transaction | Publication.Service>();
          const p = yield* prepare();
          const before = yield* snapshot(p);
          const expected = { outcome: seen.outcome, acknowledgedAt: yield* DateTime.now };
          const result = yield* run(p.bound, human, ack(p.humanNote.id));
          expect(result).toEqual(
            changed(p.humanNote, {
              state: {
                _tag: "Acknowledged",
                outcome: seen.outcome,
                acknowledgedAt: expected.acknowledgedAt,
              },
            }),
          );
          expect(yield* p.bound.notifications.get(result.id)).toEqual(Option.some(result));
          expect(
            yield* p.bound.notifications.listPendingByRecipient(human.identity, { limit: 100 }),
          ).toEqual([]);
          expect(yield* notes(p.bound, human.identity)).toEqual([result]);
          const after = yield* snapshot(p);
          expect(after.activity).toEqual(before.activity);
          expect(after.participation).toEqual(before.participation);
          expect(after.agent).toEqual(before.agent);
          expect(after.owner).toEqual(before.owner);
          const events = yield* facts(
            p.bound,
            Effect.flatMap(Journal.Service, (j) =>
              j.read({ name: NotificationFacts.Acknowledged.name, limit: 10 }),
            ),
          );
          expect(events).toHaveLength(1);
          const entry = events[0];
          if (!entry) return yield* Effect.die("Missing acknowledgment event");
          const event = yield* Event.decode(NotificationFacts.Acknowledged, entry);
          expect(event.payload).toEqual({
            workspaceId,
            notificationId: result.id,
            recipient: human.identity,
            acknowledgment: expected,
          });
          expect(event.provenance.performedBy).toEqual({
            _tag: "Member",
            memberId: human.memberId,
            identity: human.identity,
          });
          expect(event.provenance.occurredAt).toEqual(expected.acknowledgedAt);
          yield* TestClock.adjust("1 second");
          expect(yield* run(p.bound, human, ack(result.id))).toEqual(result);
          expect(yield* snapshot(p)).toEqual(after);
          const ownerResult = yield* run(p.bound, p.owner, ack(p.ownerNote.id));
          expect(ownerResult.state._tag).toBe("Acknowledged");
          expect(yield* run(p.bound, p.owner, resolve(p.ownerNote.id))).toEqual({
            message: p.first.message,
            activity: p.first.activity,
          });
        }),
      ),
    ),
);

it.effect(
  "acknowledgment requires active ownership, has no role bypass, and cannot accept agent work",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const p = yield* prepare();
          const before = yield* snapshot(p);
          for (const [actor, id, tag] of [
            [p.owner, p.humanNote.id, "NotificationApplication.NotFound"],
            [agent, p.humanNote.id, "NotificationApplication.NotFound"],
            [human, p.agentNote.id, "NotificationApplication.NotFound"],
            [human, Notification.Id.make("missing"), "NotificationApplication.NotFound"],
            [agent, p.agentNote.id, "NotificationApplication.HumanRecipientRequired"],
            [
              changed(human, { identity: p.owner.identity }),
              p.humanNote.id,
              "Authorization.InvalidActor",
            ],
          ] as const)
            expect(yield* Effect.flip(run(p.bound, actor, ack(id)))).toMatchObject({ _tag: tag });
          expect(yield* snapshot(p)).toEqual(before);
          // A captured application still checks membership inside every commit.
          yield* run(
            p.bound,
            human,
            Effect.gen(function* () {
              const application = yield* NotificationApplication.Service;
              yield* run(
                p.bound,
                p.owner,
                Effect.flatMap(MemberApplication.Service, (s) => s.remove(human.memberId)),
              );
              expect(yield* Effect.flip(application.acknowledge(p.humanNote.id))).toMatchObject({
                _tag: "Authorization.InvalidActor",
              });
            }),
          );
          expect(yield* p.bound.notifications.get(p.humanNote.id)).toEqual(
            Option.some(p.humanNote),
          );
        }),
      ),
    ),
);

it.effect(
  "people can clear their own inbox after source access is lost without resolving or rejoining",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const p = yield* prepare();
          expect(yield* Effect.flip(run(p.bound, human, resolve(p.humanNote.id)))).toMatchObject({
            _tag: "NotificationApplication.SourceUnavailable",
          });
          const admission = Option.getOrThrow(
            yield* p.bound.groupMemberships.findActive(p.group.id, human.memberId),
          );
          yield* run(
            p.bound,
            human,
            Effect.flatMap(GroupMembershipApplication.Service, (s) =>
              s.leave({ groupId: p.group.id, membershipId: admission.id }),
            ),
          );
          const before = yield* snapshot(p);
          const bound = {
            ...p.bound,
            context: Context.add(p.bound.context, Store.Service, {
              ...p.bound.store,
              getEntry: () => Effect.die("Acknowledgment must not resolve the source"),
            }),
          };
          expect((yield* run(bound, human, ack(p.humanNote.id))).state._tag).toBe("Acknowledged");
          expect(yield* Effect.flip(run(p.bound, human, resolve(p.humanNote.id)))).toMatchObject({
            _tag: "NotificationApplication.SourceUnavailable",
          });
          expect((yield* snapshot(p)).participation).toEqual(before.participation);
          const missing = changed(p.humanNote, {
            id: Notification.Id.make("missing-source"),
            source: { logId: Log.Id.make("other-log"), entryId: p.humanNote.source.entryId },
          });
          yield* p.bound.store.transaction(p.bound.notifications.insert(missing));
          expect((yield* run(bound, human, ack(missing.id))).state._tag).toBe("Acknowledged");
        }),
      ),
    ),
);

it.effect(
  "projection and checkpoint failures roll back acknowledgment and permit a clean retry",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const p = yield* prepare();
          const before = yield* snapshot(p);
          const failingStore = Context.add(p.bound.context, NotificationStore.Service, {
            ...p.bound.notifications,
            acknowledge: () =>
              Effect.fail(
                new NotificationStore.Failure({ operation: "acknowledge", cause: "injected" }),
              ),
          });
          const failingCheckpoint = Context.add(p.bound.context, Checkpoint.Service, {
            ...p.bound.checkpoints,
            set: () => Effect.fail(new Store.Failure({ operation: "set", cause: "injected" })),
          });
          for (const context of [failingStore, failingCheckpoint]) {
            expect(
              Exit.isFailure(
                yield* Effect.exit(run({ ...p.bound, context }, human, ack(p.humanNote.id))),
              ),
            ).toBe(true);
            expect(yield* snapshot(p)).toEqual(before);
          }
          expect((yield* run(p.bound, human, ack(p.humanNote.id))).state._tag).toBe("Acknowledged");
        }),
      ),
    ),
);

it.effect(
  "shared acknowledgment joins its caller's commit, observes staged records, and rolls back with the caller",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const p = yield* prepare();
          const before = yield* snapshot(p);
          const operation = facts(
            p.bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.commit(
                Effect.gen(function* () {
                  const acknowledgments = yield* NotificationAcknowledgment.make();
                  const staged = changed(p.humanNote, {
                    id: Notification.Id.make("staged"),
                    source: { logId: Log.Id.make("staged"), entryId: p.humanNote.source.entryId },
                  });
                  yield* p.bound.notifications.insert(staged);
                  const recorded = yield* acknowledgments.record(staged.id, { _tag: "Seen" });
                  expect(yield* p.bound.notifications.get(staged.id)).toEqual(
                    Option.some(recorded),
                  );
                  expect(yield* acknowledgments.record(staged.id, { _tag: "Seen" })).toEqual(
                    recorded,
                  );
                  yield* ack(p.humanNote.id).pipe(Effect.provideService(Actor.Service, human));
                  return yield* Effect.fail("rollback");
                }),
              ),
            ),
          );
          expect(yield* Effect.flip(operation)).toBe("rollback");
          expect(yield* snapshot(p)).toEqual(before);
          expect(yield* p.bound.notifications.get(Notification.Id.make("staged"))).toEqual(
            Option.none(),
          );
          yield* facts(
            p.bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.commit(ack(p.humanNote.id).pipe(Effect.provideService(Actor.Service, human))),
            ),
          );
          expect(
            Option.getOrThrow(yield* p.bound.notifications.get(p.humanNote.id)).state._tag,
          ).toBe("Acknowledged");
        }),
      ),
    ),
);

it.effect("staged member removal prevents acknowledgment within the same outer commit", () =>
  withDatabase((location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const p = yield* prepare();
        const before = yield* snapshot(p);
        const operation = run(
          p.bound,
          p.owner,
          Effect.flatMap(Journal.Service, (j) =>
            j.commit(
              Effect.gen(function* () {
                yield* Effect.flatMap(MemberApplication.Service, (s) => s.remove(human.memberId));
                return yield* ack(p.humanNote.id).pipe(Effect.provideService(Actor.Service, human));
              }),
            ),
          ),
        );
        expect(yield* Effect.flip(operation)).toMatchObject({ _tag: "Authorization.InvalidActor" });
        expect(yield* snapshot(p)).toEqual(before);
      }),
    ),
  ),
);

it.effect(
  "reopening and replay preserve acknowledgment after departure and never revive pending work",
  () =>
    withDatabase((location) =>
      Effect.gen(function* () {
        const saved = yield* inDatabase(
          location,
          Effect.gen(function* () {
            const p = yield* prepare();
            const result = yield* run(p.bound, human, ack(p.humanNote.id));
            const participant = (yield* p.bound.participations.listByThread(
              p.first.thread.id,
            )).find((p) => ThreadParticipation.memberOf(p.participant) === agent.memberId);
            if (!participant) return yield* Effect.die("Missing agent participation");
            yield* run(
              p.bound,
              agent,
              Effect.flatMap(ThreadParticipationApplication.Service, (s) =>
                s.unfollow({ threadId: p.first.thread.id, participationId: participant.id }),
              ),
            );
            yield* run(
              p.bound,
              p.owner,
              Effect.flatMap(MemberApplication.Service, (s) => s.remove(human.memberId)),
            );
            return {
              result,
              agent: yield* notes(p.bound, agent.identity),
              history: yield* history(p.bound),
            };
          }),
        );
        yield* inDatabase(
          location,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            expect(yield* notes(bound, human.identity)).toEqual([saved.result]);
            const sql = yield* SqlClient.SqlClient;
            yield* bound.store.transaction(
              Effect.gen(function* () {
                yield* sql.unsafe("DELETE FROM notifications");
                yield* sql.unsafe("DELETE FROM checkpoints WHERE name = 'notifications'");
              }),
            );
            yield* TestClock.adjust("2 hours");
            yield* facts(
              bound,
              Effect.flatMap(Journal.Service, (j) => j.replay),
            );
            expect(yield* notes(bound, human.identity)).toEqual([saved.result]);
            expect(yield* notes(bound, agent.identity)).toEqual(saved.agent);
            expect(
              yield* bound.notifications.listPendingByRecipient(human.identity, { limit: 100 }),
            ).toEqual([]);
            const checkpoint = yield* bound.checkpoints.get(key);
            yield* facts(
              bound,
              Effect.flatMap(Journal.Service, (j) => j.replay),
            );
            expect(yield* bound.checkpoints.get(key)).toEqual(checkpoint);
            expect(yield* history(bound)).toEqual(saved.history);
          }),
        );
      }),
    ),
);

it.effect(
  "direct acknowledgment writes validate outcomes, reject terminal and foreign records, and preserve atomicity",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const p = yield* prepare();
          const foreign = yield* boundTo(otherWorkspaceId);
          yield* initialized(foreign);
          const discarded = changed(p.humanNote, {
            id: Notification.Id.make("discarded"),
            source: { logId: Log.Id.make("discarded"), entryId: p.humanNote.source.entryId },
            state: { _tag: "Discarded", reason: "participation-ended" },
          });
          yield* p.bound.store.transaction(p.bound.notifications.insert(discarded));
          for (const id of [Notification.Id.make("missing"), p.agentNote.id, discarded.id])
            expect(
              yield* Effect.flip(
                p.bound.store.transaction(p.bound.notifications.acknowledge(id, seen)),
              ),
            ).toMatchObject({ _tag: "NotificationStore.Conflict" });
          expect(yield* Effect.flip(run(p.bound, human, ack(discarded.id)))).toMatchObject({
            _tag: "NotificationApplication.AlreadyHandled",
          });
          expect(
            yield* Effect.flip(
              foreign.store.transaction(foreign.notifications.acknowledge(p.humanNote.id, seen)),
            ),
          ).toMatchObject({ _tag: "NotificationStore.Conflict" });
          for (const field of ["outcome", "acknowledgedAt"] as const) {
            const invalid = changed(seen, {});
            Reflect.set(
              invalid,
              field,
              field === "outcome" ? { _tag: "TurnAccepted", turnId: "fake" } : "not-a-date",
            );
            expect(
              yield* Effect.flip(
                p.bound.store.transaction(
                  p.bound.notifications.acknowledge(p.humanNote.id, invalid),
                ),
              ),
            ).toMatchObject({ _tag: "NotificationStore.Conflict" });
          }
          yield* p.bound.store.transaction(p.bound.notifications.acknowledge(p.humanNote.id, seen));
          const result = yield* p.bound.notifications.get(p.humanNote.id);
          expect(result).toEqual(
            Option.some(
              changed(p.humanNote, {
                state: {
                  _tag: "Acknowledged",
                  outcome: seen.outcome,
                  acknowledgedAt: seen.acknowledgedAt,
                },
              }),
            ),
          );
          expect(
            yield* Effect.flip(
              p.bound.store.transaction(p.bound.notifications.acknowledge(p.humanNote.id, seen)),
            ),
          ).toMatchObject({ _tag: "NotificationStore.Conflict" });
          expect(yield* p.bound.notifications.get(p.humanNote.id)).toEqual(result);
          const id = p.ownerNote.id;
          expect(
            yield* Effect.flip(
              p.bound.store.transaction(
                p.bound.notifications
                  .acknowledge(id, seen)
                  .pipe(Effect.andThen(Effect.fail("rollback"))),
              ),
            ),
          ).toBe("rollback");
          expect(yield* p.bound.notifications.get(id)).toEqual(Option.some(p.ownerNote));
          const handle = yield* p.bound.store.transaction(Store.Transaction);
          expect(
            Exit.isFailure(
              yield* Effect.exit(
                p.bound.notifications
                  .acknowledge(id, seen)
                  .pipe(Effect.provideService(Store.Transaction, handle)),
              ),
            ),
          ).toBe(true);
          expect(yield* p.bound.notifications.get(id)).toEqual(Option.some(p.ownerNote));
        }),
      ),
    ),
);

it.effect(
  "concurrent acknowledgments preserve one durable outcome and remain safe to retry after contention",
  () =>
    withDatabase((location) =>
      Effect.gen(function* () {
        const saved = yield* inDatabase(location, prepare());
        const gate = yield* Deferred.make<void>();
        const signals = [yield* Deferred.make<void>(), yield* Deferred.make<void>()];
        const fibers = yield* Effect.forEach(signals, (signal) =>
          inDatabase(
            location,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              yield* Deferred.succeed(signal, undefined);
              yield* Deferred.await(gate);
              return yield* run(bound, human, ack(saved.humanNote.id));
            }),
          ).pipe(Effect.exit, Effect.forkChild),
        );
        yield* Effect.forEach(signals, Deferred.await);
        yield* Deferred.succeed(gate, undefined);
        const results = yield* Effect.forEach(fibers, Fiber.join);
        expect(results.some(Exit.isSuccess)).toBe(true);
        for (const result of results)
          if (Exit.isFailure(result))
            expect(Cause.findErrorOption(result.cause)).toMatchObject({
              value: { _tag: "JournalStore.Conflict" },
            });
        yield* inDatabase(
          location,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            const result = yield* run(bound, human, ack(saved.humanNote.id));
            for (const outcome of results)
              if (Exit.isSuccess(outcome)) expect(outcome.value).toEqual(result);
            const events = yield* facts(
              bound,
              Effect.flatMap(Journal.Service, (j) =>
                j.read({ name: NotificationFacts.Acknowledged.name, limit: 100 }),
              ),
            );
            expect(events).toHaveLength(1);
          }),
        );
      }),
    ),
);

it.effect(
  "acknowledgment rejects inconsistent fact references and malformed internal records without writes",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const p = yield* prepare();
          const before = yield* snapshot(p);
          const payload = {
            workspaceId,
            notificationId: p.humanNote.id,
            recipient: human.identity,
            acknowledgment: seen,
          };
          for (const invalid of [
            { ...payload, workspaceId: otherWorkspaceId },
            { ...payload, notificationId: Notification.Id.make("missing") },
            { ...payload, recipient: p.owner.identity },
          ]) {
            expect(
              Exit.isFailure(
                yield* Effect.exit(
                  facts(
                    p.bound,
                    Effect.flatMap(Journal.Service, (j) =>
                      j.publish(NotificationFacts.Acknowledged, invalid),
                    ),
                  ),
                ),
              ),
            ).toBe(true);
            expect(yield* snapshot(p)).toEqual(before);
          }
          for (const record of [
            changed(p.humanNote, { id: Notification.Id.make("wrong") }),
            changed(p.humanNote, { workspaceId: otherWorkspaceId }),
            p.agentNote,
          ]) {
            const context = Context.add(p.bound.context, NotificationStore.Service, {
              ...p.bound.notifications,
              get: () => Effect.succeedSome(record),
            });
            const operation = facts(
              { ...p.bound, context },
              Effect.flatMap(Journal.Service, (j) =>
                j.commit(
                  Effect.gen(function* () {
                    const acknowledgments = yield* NotificationAcknowledgment.make();
                    return yield* acknowledgments.record(
                      record === p.agentNote ? p.agentNote.id : p.humanNote.id,
                      { _tag: "Seen" },
                    );
                  }),
                ),
              ),
            );
            expect(yield* Effect.flip(operation)).toMatchObject({
              _tag: "NotificationAcknowledgment.InvalidReference",
            });
            expect(yield* snapshot(p)).toEqual(before);
          }
        }),
      ),
    ),
);

it.effect(
  "gateway exposes acknowledgment outcomes and invalid-input errors without exposing internal services",
  () =>
    withDatabase((location) =>
      Effect.gen(function* () {
        const p = yield* inDatabase(location, prepare());
        yield* Effect.gen(function* () {
          const gateway = yield* Gateway.Service;
          const result = yield* gateway.asMember(workspaceId, human.identity, ack(p.humanNote.id));
          expect(result.state._tag).toBe("Acknowledged");
          expect(yield* gateway.asMember(workspaceId, human.identity, ack(p.humanNote.id))).toEqual(
            result,
          );
          expect(
            yield* Effect.flip(
              gateway.asMember(workspaceId, p.owner.identity, ack(p.humanNote.id)),
            ),
          ).toMatchObject({ _tag: "NotificationApplication.NotFound" });
          expect(
            yield* Effect.flip(gateway.asMember(workspaceId, agent.identity, ack(p.agentNote.id))),
          ).toMatchObject({ _tag: "NotificationApplication.HumanRecipientRequired" });
          const invalid = { id: p.humanNote.id };
          Reflect.set(invalid, "id", "");
          expect(
            yield* Effect.flip(gateway.asMember(workspaceId, human.identity, ack(invalid.id))),
          ).toMatchObject({ _tag: "Gateway.InvalidInput" });
        }).pipe(Effect.provide(host(location)));
      }),
    ),
);
