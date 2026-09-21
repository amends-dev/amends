import { Publication } from "../../src/journal/publication.ts";
import { testProvenance } from "../publication.ts";
import { expect, expectTypeOf, test } from "bun:test";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
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
import { CommittedEvents } from "../../src/journal/committed-events.ts";
import { Notification } from "../../src/notification/notification.ts";
import { NotificationApplication } from "../../src/notification/application.ts";
import { NotificationStore } from "../../src/notification/store.ts";
import { Member } from "../../src/workspace/member/member.ts";
import { MemberFacts } from "../../src/workspace/member/facts.ts";
import { MemberProjection } from "../../src/workspace/member/projection.ts";
import { MemberStore } from "../../src/workspace/member/store.ts";
import { Workspace } from "../../src/workspace/workspace.ts";
import { make, type Fixture } from "../memory-store.ts";

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
  recipient = alice.identity,
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
const theirs = record("theirs", bob.identity);
const agents = record("agents", agent.identity);
const sameRecipient = Schema.toEquivalence(Notification.Recipient);
const unexpected = () => Effect.die("Notification reads must not write");

const seed = (fixture: Fixture) =>
  Effect.runPromise(
    fixture.store.transaction(
      Effect.forEach([alice, agent, bob], (actor) =>
        fixture.members(workspaceId).insert({
          id: actor.memberId,
          workspaceId,
          identity: actor.identity,
          status: "active",
        }),
      ),
    ),
  );

const configured = (fixture: Fixture, overrides: Partial<NotificationStore.Interface> = {}) => {
  const records = [mine, theirs, agents];
  const list = (recipient: Notification.Recipient, options: NotificationStore.ReadOptions) =>
    Effect.succeed(
      records.filter((value) => sameRecipient(value.recipient, recipient)).slice(0, options.limit),
    );
  const notifications = Layer.succeed(NotificationStore.Service, {
    workspaceId,
    get: (id) => Effect.succeed(Option.fromUndefinedOr(records.find((value) => value.id === id))),
    listByRecipient: list,
    listPendingByRecipient: list,
    insert: unexpected,
    ...overrides,
  });
  const host = Layer.mergeAll(
    Layer.succeed(Store.Service, fixture.store),
    CommittedEvents.layer(workspaceId),
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
  return NotificationApplication.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(journal, authorization).pipe(Layer.provide(host))),
    Layer.provide(notifications),
  );
};
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    NotificationApplication.Service | Journal.Service | Authorization.Service | Actor.Service
  >,
  actor = alice,
  overrides: Partial<NotificationStore.Interface> = {},
) =>
  Effect.runPromise(
    program.pipe(
      Effect.provide(configured(fixture, overrides)),
      Effect.provideService(Actor.Service, actor),
    ),
  );

test("notification reads require the current actor, need no role grant, and leave the journal unchanged", async () => {
  expectTypeOf<Layer.Services<typeof NotificationApplication.layer>>().toEqualTypeOf<
    NotificationStore.Service | Authorization.Service
  >();
  expectTypeOf<
    Effect.Services<ReturnType<NotificationApplication.Interface["get"]>>
  >().toEqualTypeOf<Actor.Service>();
  const fixture = await Effect.runPromise(make());
  await seed(fixture);
  const attempts = await Effect.runPromise(fixture.attempts);
  await run(
    fixture,
    Effect.gen(function* () {
      const notifications = yield* NotificationApplication.Service;
      expect(notifications.workspaceId).toBe(workspaceId);
      expect(yield* notifications.get(mine.id)).toEqual(mine);
      expect(yield* notifications.list(page)).toEqual([mine]);
      expect(yield* notifications.listPending(page)).toEqual([mine]);
      expect(yield* (yield* Journal.Service).log.read({ limit: 10 })).toEqual([]);
    }),
  );
  expect(await Effect.runPromise(fixture.attempts)).toBe(attempts);
});

test("one notification service resolves each caller, including humans and agents with the same identity ID", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture);
  await run(
    fixture,
    Effect.gen(function* () {
      const notifications = yield* NotificationApplication.Service;
      for (const [actor, expected] of [
        [alice, mine],
        [agent, agents],
        [bob, theirs],
      ] as const) {
        expect(
          yield* notifications.get(expected.id).pipe(Effect.provideService(Actor.Service, actor)),
        ).toEqual(expected);
        expect(
          yield* notifications.list(page).pipe(Effect.provideService(Actor.Service, actor)),
        ).toEqual([expected]);
        expect(
          yield* notifications.listPending(page).pipe(Effect.provideService(Actor.Service, actor)),
        ).toEqual([expected]);
      }
    }),
  );
});

test("missing notifications and another recipient's notifications have the same public outcome", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture);
  await run(
    fixture,
    Effect.gen(function* () {
      const notifications = yield* NotificationApplication.Service;
      for (const id of [theirs.id, agents.id, Notification.Id.make("absent")]) {
        expect(yield* Effect.flip(notifications.get(id))).toEqual(
          new NotificationApplication.NotFound({
            workspaceId,
            notificationId: id,
          }),
        );
      }
    }),
  );
});

test("authorization rejects missing, removed, mismatched, or foreign actors before reading notifications", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture);
  await Effect.runPromise(
    fixture.store.transaction(fixture.members(workspaceId).markRemoved(bob.memberId)),
  );
  for (const actor of [
    bob,
    Actor.Value.make({ ...alice, memberId: Member.Id.make("missing") }),
    Actor.Value.make({ ...alice, identity: agent.identity }),
    Actor.Value.make({ ...alice, workspaceId: otherWorkspaceId }),
  ]) {
    await run(
      fixture,
      Effect.gen(function* () {
        const notifications = yield* NotificationApplication.Service;
        for (const operation of [
          notifications.get(mine.id).pipe(Effect.asVoid),
          notifications.list(page).pipe(Effect.asVoid),
          notifications.listPending(page).pipe(Effect.asVoid),
        ]) {
          const error = yield* Effect.flip(operation);
          expect(error._tag).toBe(
            actor.workspaceId === otherWorkspaceId
              ? "Authorization.WorkspaceMismatch"
              : "Authorization.InvalidActor",
          );
        }
      }),
      actor,
      { get: unexpected, listByRecipient: unexpected, listPendingByRecipient: unexpected },
    );
  }
});

test("notification reads join an outer commit and observe staged membership removal", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture);
  await run(
    fixture,
    Effect.gen(function* () {
      const notifications = yield* NotificationApplication.Service;
      const journal = yield* Journal.Service;
      const error = yield* Effect.flip(
        journal.commit(
          Effect.gen(function* () {
            const native = yield* Store.Transaction;
            expect(yield* notifications.get(mine.id)).toEqual(mine);
            expect((yield* Store.Transaction).id).toBe(native.id);
            yield* journal
              .publish(MemberFacts.Removed, { workspaceId, memberId: alice.memberId })
              .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
            return yield* notifications.listPending(page);
          }),
        ),
      );
      expect(error).toMatchObject({
        _tag: "Authorization.InvalidActor",
        reason: "membership-removed",
      });
      expect(yield* notifications.listPending(page)).toEqual([mine]);
      expect(yield* journal.log.read({ limit: 10 })).toEqual([]);
    }),
    alice,
    {
      get: () =>
        Effect.gen(function* () {
          expect(Option.isSome(yield* Effect.serviceOption(Store.Transaction))).toBe(true);
          return Option.some(mine);
        }),
    },
  );
});

test("notification lists forward validated pagination with the actor's recipient, ignoring caller-selected recipients", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture);
  const options = {
    limit: 1,
    after: { recordedAt: mine.recordedAt, id: Notification.Id.make("earlier") },
  };
  const calls: Array<{
    pending: boolean;
    recipient: Notification.Recipient;
    options: NotificationStore.ReadOptions;
  }> = [];
  const list =
    (pending: boolean) =>
    (recipient: Notification.Recipient, request: NotificationStore.ReadOptions) =>
      Effect.sync(() => {
        calls.push({ pending, recipient, options: request });
        return [mine];
      });
  await run(
    fixture,
    Effect.gen(function* () {
      const notifications = yield* NotificationApplication.Service;
      const input = { ...options, recipient: bob.identity };
      expect(yield* notifications.list(input)).toEqual([mine]);
      expect(yield* notifications.listPending(input)).toEqual([mine]);
    }),
    alice,
    { listByRecipient: list(false), listPendingByRecipient: list(true) },
  );
  expect(calls).toEqual([
    { pending: false, recipient: alice.identity, options },
    { pending: true, recipient: alice.identity, options },
  ]);
});

test("invalid notification IDs and paging are rejected before store reads", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture);
  const invalid = record("invalid");
  Reflect.set(invalid, "id", "");
  const after = { recordedAt: mine.recordedAt, id: mine.id };
  Reflect.set(after, "recordedAt", "not-a-date");
  await run(
    fixture,
    Effect.gen(function* () {
      const notifications = yield* NotificationApplication.Service;
      expect((yield* Effect.flip(notifications.get(invalid.id)))._tag).toBe("SchemaError");
      for (const options of [{ limit: 0 }, { limit: -1 }, { limit: 1.5 }, { limit: 1, after }]) {
        expect((yield* Effect.flip(notifications.list(options)))._tag).toBe("SchemaError");
        expect((yield* Effect.flip(notifications.listPending(options)))._tag).toBe("SchemaError");
      }
    }),
    alice,
    { get: unexpected, listByRecipient: unexpected, listPendingByRecipient: unexpected },
  );
});

test("notification construction rejects a store from another workspace", async () => {
  const fixture = await Effect.runPromise(make());
  expect(
    await Effect.runPromise(
      Effect.flip(
        NotificationApplication.Service.pipe(
          Effect.provide(configured(fixture, { workspaceId: otherWorkspaceId })),
        ),
      ),
    ),
  ).toEqual(
    new NotificationApplication.WorkspaceMismatch({
      expectedWorkspaceId: workspaceId,
      actualWorkspaceId: otherWorkspaceId,
    }),
  );
});

test("notification lookups fail closed on malformed records, wrong IDs, and foreign workspaces", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture);
  const malformed = record("mine");
  Reflect.set(malformed, "recordedAt", "not-a-date");
  for (const [value, tag] of [
    [record("wrong-id"), "NotificationApplication.InvalidResponse"],
    [record("mine", alice.identity, otherWorkspaceId), "NotificationApplication.WorkspaceMismatch"],
    [malformed, "NotificationApplication.InvalidResponse"],
  ] as const) {
    const error = await run(
      fixture,
      Effect.gen(function* () {
        return yield* Effect.flip((yield* NotificationApplication.Service).get(mine.id));
      }),
      alice,
      { get: () => Effect.succeedSome(value) },
    );
    expect(error._tag).toBe(tag);
  }
});

test("notification lists reject foreign, misaddressed, duplicate, and oversized pages", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture);
  for (const [values, limit, tag] of [
    [[mine, theirs], 10, "NotificationApplication.InvalidResponse"],
    [[agents], 10, "NotificationApplication.InvalidResponse"],
    [
      [record("mine", alice.identity, otherWorkspaceId)],
      10,
      "NotificationApplication.WorkspaceMismatch",
    ],
    [[mine, mine], 10, "NotificationApplication.InvalidResponse"],
    [[mine, record("second")], 1, "NotificationApplication.InvalidResponse"],
  ] as const) {
    await run(
      fixture,
      Effect.gen(function* () {
        const notifications = yield* NotificationApplication.Service;
        expect((yield* Effect.flip(notifications.list({ limit })))._tag).toBe(tag);
        expect((yield* Effect.flip(notifications.listPending({ limit })))._tag).toBe(tag);
      }),
      alice,
      {
        listByRecipient: () => Effect.succeed(values),
        listPendingByRecipient: () => Effect.succeed(values),
      },
    );
  }
});

test("notification storage failures retain their cause", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture);
  const failure = new NotificationStore.Failure({ operation: "read", cause: "unavailable" });
  const fail = () => Effect.fail(failure);
  await run(
    fixture,
    Effect.gen(function* () {
      const notifications = yield* NotificationApplication.Service;
      expect(yield* Effect.flip(notifications.get(mine.id))).toBe(failure);
      expect(yield* Effect.flip(notifications.list(page))).toBe(failure);
      expect(yield* Effect.flip(notifications.listPending(page))).toBe(failure);
    }),
    alice,
    { get: fail, listByRecipient: fail, listPendingByRecipient: fail },
  );
});
