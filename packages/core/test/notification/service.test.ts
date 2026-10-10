import { ThreadQuery } from "../../src/thread/ThreadQuery.ts";
import { Publication } from "../../src/journal/publication.ts";
import { testProvenance } from "../publication.ts";
import { expect, expectTypeOf, it } from "@effect/vitest";
import { Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../../src/authorization/authorization.ts";
import { AssignmentStore } from "../../src/authorization/assignment/store.ts";
import { GrantResolver } from "../../src/authorization/grant-resolver.ts";
import { PermissionCatalog } from "../../src/authorization/permission-catalog.ts";
import { RoleStore } from "../../src/authorization/role/store.ts";
import { Actor } from "../../src/identity/actor.ts";
import { Identity } from "../../src/identity/identity.ts";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Entry } from "../../src/journal/entry.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Store } from "../../src/journal/store.ts";
import { Notification } from "../../src/notification/notification.ts";
import { NotificationService } from "../../src/notification/service.ts";
import { NotificationStore } from "../../src/notification/store.ts";
import { Member } from "../../src/workspace/member/member.ts";
import { MemberFacts } from "../../src/workspace/member/facts.ts";
import { MemberProjection } from "../../src/workspace/member/projection.ts";
import { MemberStore } from "../../src/workspace/member/store.ts";
import { Workspace } from "../../src/workspace/workspace.ts";
import { make, type Fixture } from "../memory-store.ts";
import { TestSignalHub } from "../signal-hub.ts";
import { SignalHub } from "../../src/signal/hub.ts";

const workspaceId = Workspace.Id.make("workspace");
const otherWorkspaceId = Workspace.Id.make("other-workspace");
const logId = Log.Id.make("journal");
const alice = Actor.Value.make({
  workspaceId,
  memberId: Member.Id.make("alice-member"),
  identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("same-id") }),
});
const agent = Actor.Value.make({
  workspaceId,
  memberId: Member.Id.make("agent-member"),
  identity: Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make("same-id") }),
});
const bob = Actor.Value.make({
  workspaceId,
  memberId: Member.Id.make("bob-member"),
  identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") }),
});
const page = { limit: 10 };
const record = (
  id: string,
  recipient: Notification.Recipient = Notification.ofMember(alice.memberId, alice.identity),
  recordWorkspaceId = workspaceId,
): Notification.Record => ({
  id: Notification.Id.make(id),
  workspaceId: recordWorkspaceId,
  source: { logId, entryId: Entry.Id.make(`source-${id}`) },
  recipient,
  recordedAt: DateTime.makeUnsafe("2026-09-19T12:00:00Z"),
  state: { _tag: "Pending" },
});
const mine = record("mine");
const theirs = record("theirs", Notification.ofMember(bob.memberId, bob.identity));
const agents = record("agents", Notification.ofMember(agent.memberId, agent.identity));
const sameRecipient = Schema.toEquivalence(Notification.Recipient);
const unexpected = () => Effect.die("Notification reads must not write");
const seed = (fixture: Fixture) =>
  fixture.store.transaction(
    Effect.forEach([alice, agent, bob], (actor) =>
      fixture.members(workspaceId).insert({
        id: actor.memberId,
        workspaceId,
        identity: actor.identity,
        status: "active",
      }),
    ),
  );
const configured = (fixture: Fixture, overrides: Partial<NotificationStore.Interface> = {}) => {
  const records = [mine, theirs, agents];
  const list = (
    recipient: Notification.Recipient,
    options: NotificationStore.ReadOptions | NotificationStore.LatestOptions,
  ) =>
    Effect.succeed(
      records.filter((value) => sameRecipient(value.recipient, recipient)).slice(0, options.limit),
    );
  const notifications = Layer.succeed(NotificationStore.Service, {
    get: (id) => Effect.succeed(Option.fromUndefinedOr(records.find((value) => value.id === id))),
    listPendingByRecipient: list,
    listLatestByRecipient: list,
    listLatestPendingByRecipient: list,
    listByThread: unexpected,
    listPendingByThread: unexpected,
    countPendingByRecipient: (recipient) =>
      Effect.succeed(records.filter((value) => sameRecipient(value.recipient, recipient)).length),
    countPendingByGroup: unexpected,
    insert: unexpected,
    insertMany: unexpected,
    discardPendingForParticipation: unexpected,
    discardPendingForGroup: unexpected,
    markSeen: unexpected,
    accept: unexpected,
    ...overrides,
  });
  const host = Layer.mergeAll(
    Layer.succeed(Store.Service, fixture.store),
    Layer.succeed(Checkpoint.Service, fixture.checkpoints),
    Layer.succeed(MemberStore.Service, fixture.members(workspaceId)),
    Layer.succeed(RoleStore.Service, fixture.roles(workspaceId)),
    Layer.succeed(AssignmentStore.Service, fixture.assignments(workspaceId)),
    PermissionCatalog.layer([]),
  );
  const journal = Journal.layer({ logId, projections: [MemberProjection.definition] }).pipe(
    Layer.provide(Log.layer),
  );
  const authorization = Authorization.layer.pipe(Layer.provide(GrantResolver.layer));
  return NotificationService.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(journal, authorization).pipe(Layer.provideMerge(host))),
    Layer.provide(notifications),
    Layer.provide(
      Layer.succeed(ThreadQuery.Service, {
        requireAccess: unexpected,
        requireReadable: unexpected,
        eligibleMembers: unexpected,
        followers: unexpected,
        currentParticipants: unexpected,
        pageParticipants: unexpected,
        findParticipants: unexpected,
        listReadable: unexpected,
        readTimeline: unexpected,
        readTimelineItem: unexpected,
      }),
    ),
    Layer.provide(TestSignalHub.layer),
    Layer.provide(
      Layer.succeed(
        Crypto.Crypto,
        Crypto.make({ randomBytes: (size) => new Uint8Array(size), digest: unexpected }),
      ),
    ),
  );
};
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    NotificationService.Service | Journal.Service | Authorization.Service | Actor.Service
  >,
  actor = alice,
  overrides: Partial<NotificationStore.Interface> = {},
) =>
  program.pipe(
    Effect.provide(configured(fixture, overrides)),
    Effect.provideService(Actor.Service, actor),
  );
/** A page of the inbox as the actor reads it: their notifications, without sources here. */
const inboxOf = (...records: ReadonlyArray<Notification.Record>) =>
  records.map((notification) => ({ notification }));

it.effect(
  "inbox reads require the current actor, need no role grant, and leave the journal unchanged",
  () =>
    Effect.gen(function* () {
      expectTypeOf<Layer.Services<typeof NotificationService.layer>>().toEqualTypeOf<
        | NotificationStore.Service
        | Authorization.Service
        | Journal.Service
        | ThreadQuery.Service
        | SignalHub.Service
        | Store.Service
      >();
      expectTypeOf<
        Effect.Services<ReturnType<NotificationService.Interface["inbox"]>>
      >().toEqualTypeOf<Actor.Service>();
      const fixture = yield* make(workspaceId);
      yield* seed(fixture);
      const attempts = yield* fixture.attempts;
      yield* run(
        fixture,
        Effect.gen(function* () {
          const notificationService = yield* NotificationService.Service;
          expect(yield* notificationService.inbox(page)).toEqual(inboxOf(mine));
          expect(yield* notificationService.inbox({ ...page, pendingOnly: true })).toEqual(
            inboxOf(mine),
          );
          expect(yield* notificationService.countPending).toBe(1);
          expect(yield* (yield* Journal.Service).log.read({ limit: 10 })).toEqual([]);
        }),
      );
      expect(yield* fixture.attempts).toBe(attempts);
    }),
);

it.effect(
  "one notification service resolves each caller, including humans and agents with the same identity ID",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make(workspaceId);
      yield* seed(fixture);
      yield* run(
        fixture,
        Effect.gen(function* () {
          const notificationService = yield* NotificationService.Service;
          for (const [actor, expected] of [
            [alice, mine],
            [agent, agents],
            [bob, theirs],
          ] as const) {
            expect(
              yield* notificationService
                .inbox(page)
                .pipe(Effect.provideService(Actor.Service, actor)),
            ).toEqual(inboxOf(expected));
            expect(
              yield* notificationService
                .inbox({ ...page, pendingOnly: true })
                .pipe(Effect.provideService(Actor.Service, actor)),
            ).toEqual(inboxOf(expected));
          }
        }),
      );
    }),
);

it.effect(
  "missing notifications and another recipient's notifications have the same public outcome",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make(workspaceId);
      yield* seed(fixture);
      yield* run(
        fixture,
        Effect.gen(function* () {
          const notificationService = yield* NotificationService.Service;
          for (const id of [theirs.id, agents.id, Notification.Id.make("absent")]) {
            expect(yield* Effect.flip(notificationService.markSeen(id))).toEqual(
              new NotificationService.NotFound({
                workspaceId,
                notificationId: id,
              }),
            );
          }
        }),
      );
    }),
);

it.effect(
  "authorization rejects missing, removed, mismatched, or foreign actors before reading notifications",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make(workspaceId);
      yield* seed(fixture);
      yield* fixture.store.transaction(fixture.members(workspaceId).markRemoved(bob.memberId));
      for (const actor of [
        bob,
        Actor.Value.make({ ...alice, memberId: Member.Id.make("missing") }),
        Actor.Value.make({ ...alice, identity: agent.identity }),
        Actor.Value.make({ ...alice, workspaceId: otherWorkspaceId }),
      ]) {
        yield* run(
          fixture,
          Effect.gen(function* () {
            const notificationService = yield* NotificationService.Service;
            const operations: ReadonlyArray<
              Effect.Effect<void, { readonly _tag: string }, Actor.Service>
            > = [
              notificationService.markSeen(mine.id).pipe(Effect.asVoid),
              notificationService.inbox(page).pipe(Effect.asVoid),
              notificationService.countPending.pipe(Effect.asVoid),
            ];
            for (const operation of operations) {
              const error = yield* Effect.flip(operation);
              expect(error._tag).toBe(
                actor.workspaceId === otherWorkspaceId
                  ? "Authorization.WorkspaceMismatch"
                  : "Authorization.InvalidActor",
              );
            }
          }),
          actor,
          {
            get: unexpected,
            listLatestByRecipient: unexpected,
            countPendingByRecipient: unexpected,
          },
        );
      }
    }),
);

it.effect("inbox reads join an outer commit and observe staged membership removal", () =>
  Effect.gen(function* () {
    const fixture = yield* make(workspaceId);
    yield* seed(fixture);
    yield* run(
      fixture,
      Effect.gen(function* () {
        const notificationService = yield* NotificationService.Service;
        const journal = yield* Journal.Service;
        const error = yield* Effect.flip(
          journal.commit(
            Effect.gen(function* () {
              const storeTransaction = yield* Store.Transaction;
              expect(yield* notificationService.inbox(page)).toEqual(inboxOf(mine));
              expect((yield* Store.Transaction).id).toBe(storeTransaction.id);
              yield* journal
                .publish(MemberFacts.Removed, { workspaceId, memberId: alice.memberId })
                .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
              return yield* notificationService.countPending;
            }),
          ),
        );
        expect(error).toMatchObject({
          _tag: "Authorization.InvalidActor",
          reason: "membership-removed",
        });
        expect(yield* notificationService.countPending).toBe(1);
        expect(yield* journal.log.read({ limit: 10 })).toEqual([]);
      }),
      alice,
      {
        listLatestByRecipient: () =>
          Effect.gen(function* () {
            expect(Option.isSome(yield* Effect.serviceOption(Store.Transaction))).toBe(true);
            return [mine];
          }),
      },
    );
  }),
);

it.effect(
  "the inbox forwards validated paging with the actor's recipient, ignoring caller-selected recipients",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make(workspaceId);
      yield* seed(fixture);
      const options = {
        limit: 1,
        before: { recordedAt: mine.recordedAt, id: Notification.Id.make("later") },
      };
      const calls: Array<{
        pending: boolean;
        recipient: Notification.Recipient;
        options: NotificationStore.LatestOptions;
      }> = [];
      const latest =
        (pending: boolean) =>
        (recipient: Notification.Recipient, request: NotificationStore.LatestOptions) =>
          Effect.sync(() => {
            calls.push({ pending, recipient, options: request });
            return [mine];
          });
      yield* run(
        fixture,
        Effect.gen(function* () {
          const notificationService = yield* NotificationService.Service;
          const input = { ...options, recipient: bob.identity };
          expect(yield* notificationService.inbox(input)).toEqual(inboxOf(mine));
          expect(yield* notificationService.inbox({ ...input, pendingOnly: true })).toEqual(
            inboxOf(mine),
          );
        }),
        alice,
        { listLatestByRecipient: latest(false), listLatestPendingByRecipient: latest(true) },
      );
      // The actor's inbox is their membership's.
      const recipient = Notification.ofMember(alice.memberId, alice.identity);
      expect(calls).toEqual([
        { pending: false, recipient, options },
        { pending: true, recipient, options },
      ]);
    }),
);

it.effect("invalid notification IDs and paging are rejected before store reads", () =>
  Effect.gen(function* () {
    const fixture = yield* make(workspaceId);
    yield* seed(fixture);
    const invalid = record("invalid");
    Reflect.set(invalid, "id", "");
    const before = { recordedAt: mine.recordedAt, id: mine.id };
    Reflect.set(before, "recordedAt", "not-a-date");
    yield* run(
      fixture,
      Effect.gen(function* () {
        const notificationService = yield* NotificationService.Service;
        expect((yield* Effect.flip(notificationService.markSeen(invalid.id)))._tag).toBe(
          "SchemaError",
        );
        for (const options of [{ limit: 0 }, { limit: -1 }, { limit: 1.5 }, { limit: 1, before }])
          expect((yield* Effect.flip(notificationService.inbox(options)))._tag).toBe("SchemaError");
      }),
      alice,
      {
        get: unexpected,
        listLatestByRecipient: unexpected,
        listLatestPendingByRecipient: unexpected,
      },
    );
  }),
);

it.effect("notification storage failures retain their cause", () =>
  Effect.gen(function* () {
    const fixture = yield* make(workspaceId);
    yield* seed(fixture);
    const failure = new NotificationStore.Failure({ operation: "read", cause: "unavailable" });
    const fail = () => Effect.fail(failure);
    yield* run(
      fixture,
      Effect.gen(function* () {
        const notificationService = yield* NotificationService.Service;
        expect(yield* Effect.flip(notificationService.markSeen(mine.id))).toBe(failure);
        expect(yield* Effect.flip(notificationService.inbox(page))).toBe(failure);
        expect(yield* Effect.flip(notificationService.countPending)).toBe(failure);
      }),
      alice,
      { get: fail, listLatestByRecipient: fail, countPendingByRecipient: fail },
    );
  }),
);
