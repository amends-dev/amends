import * as ThreadQuery from "../../src/thread/ThreadQuery.ts";
import * as Publication from "../../src/journal/Publication.ts";
import { testProvenance } from "../publication.ts";
import { expect, expectTypeOf, it } from "@effect/vitest";
import { Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import * as Authorization from "../../src/authorization/Authorization.ts";
import * as AssignmentStore from "../../src/authorization/AssignmentStore.ts";
import * as GrantResolver from "../../src/authorization/GrantResolver.ts";
import * as PermissionCatalog from "../../src/authorization/PermissionCatalog.ts";
import * as RoleStore from "../../src/authorization/RoleStore.ts";
import * as Actor from "../../src/identity/Actor.ts";
import * as Identity from "../../src/identity/Identity.ts";
import * as Checkpoint from "../../src/journal/Checkpoint.ts";
import * as Entry from "../../src/journal/Entry.ts";
import * as Journal from "../../src/journal/Journal.ts";
import * as Log from "../../src/journal/Log.ts";
import * as Store from "../../src/journal/Store.ts";
import * as Notification from "../../src/notification/Notification.ts";
import * as NotificationService from "../../src/notification/NotificationService.ts";
import * as NotificationStore from "../../src/notification/NotificationStore.ts";
import * as Member from "../../src/workspace/Member.ts";
import * as MemberFacts from "../../src/workspace/MemberFacts.ts";
import * as MemberProjection from "../../src/workspace/MemberProjection.ts";
import * as MemberStore from "../../src/workspace/MemberStore.ts";
import * as Workspace from "../../src/workspace/Workspace.ts";
import { make, type Fixture } from "../memory.ts";
import * as TestSignalHub from "../signal-hub.ts";
import * as SignalHub from "../../src/signal/SignalHub.ts";
import * as CoreError from "../../src/error/CoreError.ts";

const workspaceId = Workspace.Id.make("workspace");
const otherWorkspaceId = Workspace.Id.make("other-workspace");
const logId = Entry.LogId.make("journal");
const alice = Actor.Actor.of({
  workspaceId,
  memberId: Member.Id.make("alice-member"),
  identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("same-id") }),
});
const agent = Actor.Actor.of({
  workspaceId,
  memberId: Member.Id.make("agent-member"),
  identity: Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make("same-id") }),
});
const bob = Actor.Actor.of({
  workspaceId,
  memberId: Member.Id.make("bob-member"),
  identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") }),
});
const page = { limit: 10 };
const record = (
  id: string,
  recipient: Notification.Recipient = Notification.ofMember(alice.memberId, alice.identity),
  recordWorkspaceId = workspaceId,
): Notification.Notification => ({
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
      fixture.members.insert({
        id: actor.memberId,
        workspaceId,
        identity: actor.identity,
        name: Member.Name.make(actor.identity.id),
        status: "active",
      }),
    ),
  );
const configured = (
  fixture: Fixture,
  overrides: Partial<NotificationStore.NotificationStore["Service"]> = {},
) => {
  const records = [mine, theirs, agents];
  const list = (
    recipient: Notification.Recipient,
    options: NotificationStore.ReadOptions | NotificationStore.LatestOptions,
  ) =>
    Effect.succeed(
      records.filter((value) => sameRecipient(value.recipient, recipient)).slice(0, options.limit),
    );
  const notifications = Layer.succeed(NotificationStore.NotificationStore, {
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
    Layer.succeed(Store.Store, fixture.store),
    Layer.succeed(Checkpoint.Checkpoint, fixture.checkpoints),
    Layer.succeed(MemberStore.MemberStore, fixture.members),
    Layer.succeed(RoleStore.RoleStore, fixture.roles),
    Layer.succeed(AssignmentStore.AssignmentStore, fixture.assignments),
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
      Layer.succeed(ThreadQuery.ThreadQuery, {
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
    | NotificationService.NotificationService
    | Journal.Journal
    | Authorization.Authorization
    | Actor.Actor
  >,
  actor = alice,
  overrides: Partial<NotificationStore.NotificationStore["Service"]> = {},
) =>
  program.pipe(
    Effect.provide(configured(fixture, overrides)),
    Effect.provideService(Actor.Actor, actor),
  );
/** A page of the inbox as the actor reads it: their notifications, without sources here. */
const inboxOf = (...records: ReadonlyArray<Notification.Notification>) =>
  records.map((notification) => ({ notification }));

it.effect(
  "inbox reads require the current actor, need no role grant, and leave the journal unchanged",
  () =>
    Effect.gen(function* () {
      expectTypeOf<Layer.Services<typeof NotificationService.layer>>().toEqualTypeOf<
        | NotificationStore.NotificationStore
        | Authorization.Authorization
        | Journal.Journal
        | ThreadQuery.ThreadQuery
        | SignalHub.SignalHub
        | Store.Store
      >();
      expectTypeOf<
        Effect.Services<ReturnType<NotificationService.NotificationService["Service"]["inbox"]>>
      >().toEqualTypeOf<Actor.Actor>();
      const fixture = yield* make(workspaceId);
      yield* seed(fixture);
      const attempts = yield* fixture.attempts;
      yield* run(
        fixture,
        Effect.gen(function* () {
          const notificationService = yield* NotificationService.NotificationService;
          expect(yield* notificationService.inbox(page)).toEqual(inboxOf(mine));
          expect(yield* notificationService.inbox({ ...page, pendingOnly: true })).toEqual(
            inboxOf(mine),
          );
          expect(yield* notificationService.countPending).toBe(1);
          expect(yield* (yield* Journal.Journal).log.read({ limit: 10 })).toEqual([]);
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
          const notificationService = yield* NotificationService.NotificationService;
          for (const [actor, expected] of [
            [alice, mine],
            [agent, agents],
            [bob, theirs],
          ] as const) {
            expect(
              yield* notificationService
                .inbox(page)
                .pipe(Effect.provideService(Actor.Actor, actor)),
            ).toEqual(inboxOf(expected));
            expect(
              yield* notificationService
                .inbox({ ...page, pendingOnly: true })
                .pipe(Effect.provideService(Actor.Actor, actor)),
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
          const notificationService = yield* NotificationService.NotificationService;
          for (const id of [theirs.id, agents.id, Notification.Id.make("absent")]) {
            expect(yield* Effect.flip(notificationService.markSeen(id))).toEqual(
              new CoreError.NotFound({ resource: "Notification", id }),
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
      yield* fixture.store.transaction(fixture.members.markRemoved(bob.memberId));
      for (const actor of [
        bob,
        Actor.Actor.of({ ...alice, memberId: Member.Id.make("missing") }),
        Actor.Actor.of({ ...alice, identity: agent.identity }),
        Actor.Actor.of({ ...alice, workspaceId: otherWorkspaceId }),
      ]) {
        yield* run(
          fixture,
          Effect.gen(function* () {
            const notificationService = yield* NotificationService.NotificationService;
            const operations: ReadonlyArray<
              Effect.Effect<void, { readonly _tag: string }, Actor.Actor>
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
                  : "CoreError.Denied",
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
        const notificationService = yield* NotificationService.NotificationService;
        const journal = yield* Journal.Journal;
        const error = yield* Effect.flip(
          journal.commit(
            Effect.gen(function* () {
              const storeTransaction = yield* Store.Transaction;
              expect(yield* notificationService.inbox(page)).toEqual(inboxOf(mine));
              expect((yield* Store.Transaction).id).toBe(storeTransaction.id);
              yield* journal
                .publish(MemberFacts.Removed, { workspaceId, memberId: alice.memberId })
                .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
              return yield* notificationService.countPending;
            }),
          ),
        );
        expect(error).toMatchObject({
          _tag: "CoreError.Denied",
          reason: { _tag: "InvalidActor", reason: "membership-removed" },
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
          const notificationService = yield* NotificationService.NotificationService;
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
        const notificationService = yield* NotificationService.NotificationService;
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
        const notificationService = yield* NotificationService.NotificationService;
        expect(yield* Effect.flip(notificationService.markSeen(mine.id))).toBe(failure);
        expect(yield* Effect.flip(notificationService.inbox(page))).toBe(failure);
        expect(yield* Effect.flip(notificationService.countPending)).toBe(failure);
      }),
      alice,
      { get: fail, listLatestByRecipient: fail, countPendingByRecipient: fail },
    );
  }),
);
