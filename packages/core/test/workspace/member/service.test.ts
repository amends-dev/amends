import { GroupCommand } from "@amends-dev/core/group";
import * as Publication from "../../../src/journal/Publication.ts";
import * as GroupMembershipStore from "../../../src/group/GroupMembershipStore.ts";
import { testCrypto, testProvenance } from "../../publication.ts";
import { expect, expectTypeOf, it } from "@effect/vitest";
import { Crypto, Effect, Layer, Option } from "effect";
import * as AssignmentFacts from "../../../src/authorization/AssignmentFacts.ts";
import * as AssignmentProjection from "../../../src/authorization/AssignmentProjection.ts";
import * as AssignmentStore from "../../../src/authorization/AssignmentStore.ts";
import * as Assignment from "../../../src/authorization/Assignment.ts";
import * as Delegation from "../../../src/authorization/Delegation.ts";
import * as Authorization from "../../../src/authorization/Authorization.ts";
import * as GrantResolver from "../../../src/authorization/GrantResolver.ts";
import * as Grant from "../../../src/authorization/Grant.ts";
import * as PermissionCatalog from "../../../src/authorization/PermissionCatalog.ts";
import * as RoleStore from "../../../src/authorization/RoleStore.ts";
import * as Scope from "../../../src/authorization/Scope.ts";
import * as Target from "../../../src/authorization/Target.ts";
import * as Actor from "../../../src/identity/Actor.ts";
import * as Identity from "../../../src/identity/Identity.ts";
import * as Checkpoint from "../../../src/journal/Checkpoint.ts";
import * as Journal from "../../../src/journal/Journal.ts";
import * as Entry from "../../../src/journal/Entry.ts";
import * as Log from "../../../src/journal/Log.ts";
import * as Store from "../../../src/journal/Store.ts";
import * as InvitationStore from "../../../src/workspace/InvitationStore.ts";
import * as MemberService from "../../../src/workspace/MemberService.ts";
import * as MemberFacts from "../../../src/workspace/MemberFacts.ts";
import * as MemberPermissions from "../../../src/workspace/MemberPermissions.ts";
import * as MemberProjection from "../../../src/workspace/MemberProjection.ts";
import * as MemberStore from "../../../src/workspace/MemberStore.ts";
import * as Member from "../../../src/workspace/Member.ts";
import * as WorkspaceStore from "../../../src/workspace/WorkspaceStore.ts";
import * as Workspace from "../../../src/workspace/Workspace.ts";
import { make, type Fixture } from "../../memory.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const foreignWorkspaceId = Workspace.Id.make("workspace-two");
const alice = Actor.Actor.of({
  workspaceId,
  memberId: Member.Id.make("alice"),
  identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") }),
});
const agent = Actor.Actor.of({
  workspaceId,
  memberId: Member.Id.make("agent"),
  identity: Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make("agent") }),
});
const bob = Member.Member.make({
  id: Member.Id.make("bob"),
  workspaceId,
  identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") }),
  name: Member.Name.make("bob"),
  status: "active",
});
const missingId = Member.Id.make("missing");
const bobScope = Scope.Scope.cases.Target.make({
  target: Target.Reference.cases.Member.make({ workspaceId, memberId: bob.id }),
});
const assignment = (
  id: string,
  scope: Scope.Scope = bobScope,
  permission = MemberPermissions.Read,
) =>
  Assignment.Assignment.make({
    id: Assignment.Id.make(id),
    workspaceId,
    memberId: alice.memberId,
    source: Assignment.Source.cases.Direct.make({
      grant: Grant.make(permission, scope),
    }),
    status: "active",
  });
const configured = (
  fixture: Fixture,
  overrides: Partial<MemberStore.MemberStore["Service"]> = {},
  workspaceOverrides: Partial<WorkspaceStore.WorkspaceStore["Service"]> = {},
) => {
  const members = Layer.succeed(MemberStore.MemberStore, {
    ...fixture.members,
    ...overrides,
  });
  const host = Layer.mergeAll(
    members,
    Layer.succeed(Store.Store, fixture.store),
    Layer.succeed(Checkpoint.Checkpoint, fixture.checkpoints),
    Layer.succeed(RoleStore.RoleStore, fixture.roles),
    Layer.succeed(AssignmentStore.AssignmentStore, fixture.assignments),
    PermissionCatalog.layer([MemberPermissions.Read, MemberPermissions.Remove]),
  );
  const journal = Journal.layer({
    logId: Entry.LogId.make("workspace-one/journal"),
    projections: [MemberProjection.definition, AssignmentProjection.definition],
  }).pipe(Layer.provide(Log.layer));
  const authorization = Authorization.layer.pipe(Layer.provide(GrantResolver.layer));
  const services = Layer.mergeAll(journal, authorization).pipe(Layer.provide(host));
  const workspace = Layer.succeed(WorkspaceStore.WorkspaceStore, {
    get: Effect.succeedSome({
      id: workspaceId,
      createdBy: Identity.HumanId.make("alice"),
      name: "Test workspace",
      ownerMemberId: alice.memberId,
    }),
    insert: () => Effect.die("Workspace insertion is not used by membership operations"),
    rename: () => Effect.die("Unexpected workspace rename"),
    transferOwnership: () => Effect.die("Ownership transfer is not used by membership operations"),
    ...workspaceOverrides,
  });
  const invitations = Layer.succeed(InvitationStore.InvitationStore, {
    listPendingByRecipient: () => Effect.succeed([]),
    list: Effect.succeed([]),
    get: () => Effect.die("Invitation lookup is not used in these member tests"),
    insert: () => Effect.die("Invitation insertion is not used in these member tests"),
    settle: () => Effect.die("These member tests have no pending invitations"),
  });
  const groupMemberships = Layer.succeed(GroupMembershipStore.GroupMembershipStore, {
    listActiveByMember: () => Effect.succeed([]),
    get: () => Effect.die("These member tests have no group admissions"),
    getMany: () => Effect.die("These member tests have no group admissions"),
    findActive: () => Effect.die("These member tests have no group admissions"),
    listByGroup: () => Effect.die("These member tests have no group admissions"),
    summarize: () => Effect.die("These member tests have no group admissions"),
    findActiveMany: () => Effect.die("These member tests have no group admissions"),
    pageActiveByGroup: () => Effect.die("These member tests have no group admissions"),
    pageActiveByMember: () => Effect.die("These member tests have no group admissions"),
    insert: () => Effect.die("These member tests have no group admissions"),
    markRemoved: () => Effect.die("These member tests have no group admissions"),
  });
  const delegation = Delegation.layer.pipe(
    Layer.provide(Layer.mergeAll(services, workspace, host)),
  );
  // Keep the journal available to exercise reads inside an outer application commit.
  return MemberService.layer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        services,
        workspace,
        invitations,
        groupMemberships,
        delegation,
        Layer.succeed(Store.Store, fixture.store),
        Layer.succeed(GroupCommand.GroupCommand, {
          admitMember: () => Effect.die("These member tests admit no one to a group"),
          removeMembership: () => Effect.die("These member tests have no group admissions"),
          establishDirect: () => Effect.die("These member tests start no direct groups"),
        }),
      ),
    ),
    Layer.provide(members),
  );
};
const get = Effect.fn("MemberApplicationTest.get")(function* (id: Member.Id) {
  return yield* (yield* MemberService.MemberService).get(id);
});
const remove = Effect.fn("MemberApplicationTest.remove")(function* (id: Member.Id) {
  return yield* (yield* MemberService.MemberService).remove(id);
});
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    | MemberService.MemberService
    | Journal.Journal
    | Authorization.Authorization
    | Delegation.Delegation
    | WorkspaceStore.WorkspaceStore
    | InvitationStore.InvitationStore
    | GroupMembershipStore.GroupMembershipStore
    | GroupCommand.GroupCommand
    | Actor.Actor
    | Crypto.Crypto
  >,
  actor: Actor.Actor["Service"] = alice,
  overrides: Partial<MemberStore.MemberStore["Service"]> = {},
  workspaceOverrides: Partial<WorkspaceStore.WorkspaceStore["Service"]> = {},
) =>
  program.pipe(
    Effect.provide(configured(fixture, overrides, workspaceOverrides)),
    Effect.provideService(Actor.Actor, actor),
    Effect.provideService(Crypto.Crypto, testCrypto),
  );
const seed = (fixture: Fixture, assignments: ReadonlyArray<Assignment.Assignment> = []) =>
  fixture.store.transaction(
    Effect.gen(function* () {
      const members = fixture.members;
      for (const actor of [alice, agent]) {
        yield* members.insert({
          id: actor.memberId,
          workspaceId,
          identity: actor.identity,
          name: Member.Name.make(actor.identity.id),
          status: "active",
        });
      }
      yield* members.insert(bob);
      for (const value of assignments) yield* fixture.assignments.insert(value);
    }),
  );
it.effect("member reads require only the current actor and leave the journal unchanged", () =>
  Effect.gen(function* () {
    expectTypeOf<Layer.Services<typeof MemberService.layer>>().toEqualTypeOf<
      | MemberStore.MemberStore
      | WorkspaceStore.WorkspaceStore
      | InvitationStore.InvitationStore
      | GroupMembershipStore.GroupMembershipStore
      | GroupCommand.GroupCommand
      | Authorization.Authorization
      | Delegation.Delegation
      | Journal.Journal
      | Crypto.Crypto
      | Store.Store
    >();
    expectTypeOf<Layer.Error<typeof MemberService.layer>>().toEqualTypeOf<never>();
    expectTypeOf<
      Effect.Services<ReturnType<MemberService.MemberService["Service"]["get"]>>
    >().toEqualTypeOf<Actor.Actor>();
    expectTypeOf<
      Effect.Error<ReturnType<MemberService.MemberService["Service"]["get"]>>
    >().toEqualTypeOf<MemberService.Error>();
    const fixture = yield* make();
    yield* seed(fixture, [assignment("read-bob")]);
    const before = yield* fixture.snapshot;
    const attempts = yield* fixture.attempts;
    expect(yield* run(fixture, get(bob.id))).toEqual(bob);
    expect(yield* fixture.attempts).toBe(attempts);
    expect(yield* fixture.snapshot).toEqual(before);
    yield* fixture.store.transaction(fixture.members.markRemoved(bob.id));
    expect(yield* run(fixture, get(bob.id))).toMatchObject({ id: bob.id, status: "removed" });
  }),
);

it.effect(
  "authorization precedes the target lookup and NotFound is only exposed to authorized callers",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* seed(fixture, [assignment("read-bob")]);
      const lookedUp: Array<Member.Id> = [];
      const overrides = {
        get: Effect.fn("MemberApplicationTest.observeGet")(function* (id: Member.Id) {
          lookedUp.push(id);
          return yield* fixture.members.get(id);
        }),
      };
      for (const id of [agent.memberId, missingId]) {
        expect(yield* run(fixture, get(id).pipe(Effect.flip), alice, overrides)).toMatchObject({
          _tag: "CoreError.Denied",
          reason: {
            _tag: "NotGranted",
            requirement: {
              permission: { name: MemberPermissions.Read.name },
              target: { memberId: id },
            },
          },
        });
      }
      expect(lookedUp).toEqual([alice.memberId, alice.memberId]);
      yield* fixture.store.transaction(
        fixture.assignments.insert(
          assignment("read-workspace", Scope.Scope.cases.Workspace.make({ workspaceId })),
        ),
      );
      expect(yield* run(fixture, get(missingId).pipe(Effect.flip))).toMatchObject({
        _tag: "CoreError.NotFound",
        resource: "Member",
        id: missingId,
      });
    }),
);

it.effect("a shared member application uses each call's actor and current membership", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* seed(fixture, [assignment("read-bob")]);
    const application = yield* run(fixture, MemberService.MemberService);
    const read = application.get(bob.id);
    expect(yield* read.pipe(Effect.provideService(Actor.Actor, alice))).toEqual(bob);
    expect(yield* read.pipe(Effect.provideService(Actor.Actor, agent), Effect.flip)).toMatchObject({
      _tag: "CoreError.Denied",
      reason: { _tag: "NotGranted", memberId: agent.memberId },
    });
    yield* fixture.store.transaction(fixture.members.markRemoved(alice.memberId));
    expect(yield* read.pipe(Effect.provideService(Actor.Actor, alice), Effect.flip)).toMatchObject({
      _tag: "CoreError.Denied",
      reason: { _tag: "InvalidActor", reason: "membership-removed" },
    });
  }),
);

it.effect(
  "member reads join the current commit and see staged grants and membership projections",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* seed(fixture);
      const readBob = assignment("read-bob");
      const attempts = yield* fixture.attempts;
      yield* run(
        fixture,
        Effect.gen(function* () {
          const journal = yield* Journal.Journal;
          const memberService = yield* MemberService.MemberService;
          yield* journal.commit(
            Effect.gen(function* () {
              yield* journal
                .publish(AssignmentFacts.Created, {
                  assignmentId: readBob.id,
                  workspaceId,
                  memberId: alice.memberId,
                  source: readBob.source,
                })
                .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
              yield* journal
                .publish(MemberFacts.Removed, { workspaceId, memberId: bob.id })
                .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
              expect(yield* memberService.get(bob.id)).toMatchObject({
                id: bob.id,
                status: "removed",
              });
            }),
          );
        }),
      );
      expect(yield* fixture.attempts).toBe(attempts + 1);
      const snapshot = yield* fixture.snapshot;
      expect(snapshot.logs.size).toBe(1);
      expect(
        [...snapshot.logs.values()].flatMap((batches) => batches.flatMap((batch) => batch.entries)),
      ).toHaveLength(2);
    }),
);

it.effect("a staged revocation denies the read and rolls back the enclosing commit", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    const readBob = assignment("read-bob");
    yield* seed(fixture, [readBob]);
    const before = yield* fixture.snapshot;
    const failure = yield* run(
      fixture,
      Effect.gen(function* () {
        const journal = yield* Journal.Journal;
        const memberService = yield* MemberService.MemberService;
        return yield* journal.commit(
          Effect.gen(function* () {
            yield* journal
              .publish(AssignmentFacts.Revoked, {
                workspaceId,
                assignmentId: readBob.id,
                memberId: alice.memberId,
              })
              .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
            return yield* memberService.get(bob.id);
          }),
        );
      }).pipe(Effect.flip),
    );
    expect(failure).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "NotGranted" } });
    expect(yield* fixture.snapshot).toEqual(before);
    expect(yield* run(fixture, get(bob.id))).toEqual(bob);
  }),
);

it.effect("member reads refuse an actor from another workspace", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* seed(fixture, [assignment("read-bob")]);
    const foreignActor = Actor.Actor.of({
      workspaceId: foreignWorkspaceId,
      memberId: alice.memberId,
      identity: alice.identity,
    });
    expect(yield* run(fixture, get(bob.id).pipe(Effect.flip), foreignActor)).toMatchObject({
      _tag: "Authorization.WorkspaceMismatch",
    });
  }),
);

it.effect("member reads pass storage failures through", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* seed(fixture, [assignment("read-bob")]);
    const storageFailure = new MemberStore.Failure({ operation: "get", cause: "unavailable" });
    expect(
      yield* run(fixture, get(bob.id).pipe(Effect.flip), alice, {
        get: (id) => (id === bob.id ? Effect.fail(storageFailure) : fixture.members.get(id)),
      }),
    ).toBe(storageFailure);
  }),
);

it.effect(
  "exact-target removal needs no read grant and rejects an actor retained before removal",
  () =>
    Effect.gen(function* () {
      expectTypeOf<
        Effect.Services<ReturnType<MemberService.MemberService["Service"]["remove"]>>
      >().toEqualTypeOf<Actor.Actor>();
      const fixture = yield* make();
      yield* seed(fixture, [assignment("remove-bob", bobScope, MemberPermissions.Remove)]);
      const application = yield* run(fixture, MemberService.MemberService);
      expect(yield* run(fixture, get(bob.id).pipe(Effect.flip))).toMatchObject({
        _tag: "CoreError.Denied",
        reason: { _tag: "NotGranted" },
      });
      expect(yield* run(fixture, remove(agent.memberId).pipe(Effect.flip))).toMatchObject({
        _tag: "CoreError.Denied",
        reason: { _tag: "NotGranted" },
      });
      const removed = yield* run(fixture, remove(bob.id));
      expect(removed).toEqual({
        id: bob.id,
        workspaceId,
        identity: bob.identity,
        name: bob.name,
        status: "removed",
      });
      expect(yield* fixture.members.get(bob.id)).toEqual(Option.some(removed));
      const staleActor = Actor.Actor.of({
        workspaceId,
        memberId: bob.id,
        identity: bob.identity,
      });
      expect(
        yield* application
          .get(bob.id)
          .pipe(Effect.provideService(Actor.Actor, staleActor), Effect.flip),
      ).toMatchObject({
        _tag: "CoreError.Denied",
        reason: { _tag: "InvalidActor", reason: "membership-removed" },
      });
      const beforeRepeat = yield* fixture.snapshot;
      expect(yield* run(fixture, remove(bob.id).pipe(Effect.flip))).toMatchObject({
        _tag: "MemberService.AlreadyRemoved",
      });
      expect(yield* fixture.snapshot).toEqual(beforeRepeat);
    }),
);

it.effect(
  "removal checks permission before disclosing a missing target and protects the owner from any member",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* seed(fixture, [assignment("read-bob")]);
      const before = yield* fixture.snapshot;
      // Ownership and read permission each confer no removal authority.
      for (const id of [bob.id, missingId, alice.memberId]) {
        expect(yield* run(fixture, remove(id).pipe(Effect.flip))).toMatchObject({
          _tag: "CoreError.Denied",
          reason: { _tag: "NotGranted" },
        });
      }
      expect(yield* fixture.snapshot).toEqual(before);
      const workspaceScope = Scope.Scope.cases.Workspace.make({ workspaceId });
      const ownerGrant = assignment("remove-workspace", workspaceScope, MemberPermissions.Remove);
      yield* fixture.store.transaction(
        Effect.gen(function* () {
          yield* fixture.assignments.insert(ownerGrant);
          yield* fixture.assignments.insert({
            id: Assignment.Id.make("agent-remove-workspace"),
            workspaceId,
            memberId: agent.memberId,
            source: ownerGrant.source,
            status: "active",
          });
        }),
      );
      const authorized = yield* fixture.snapshot;
      expect(yield* run(fixture, remove(missingId).pipe(Effect.flip))).toMatchObject({
        _tag: "CoreError.NotFound",
      });
      for (const actor of [alice, agent]) {
        expect(yield* run(fixture, remove(alice.memberId).pipe(Effect.flip), actor)).toMatchObject({
          _tag: "MemberService.OwnerProtected",
          workspaceId,
          memberId: alice.memberId,
        });
      }
      expect(yield* fixture.snapshot).toEqual(authorized);
      // An authorized non-owner, including an agent, can remove their own membership.
      expect(yield* run(fixture, remove(agent.memberId), agent)).toMatchObject({
        id: agent.memberId,
        status: "removed",
      });
    }),
);

it.effect("removal passes a failure reading ownership through and writes nothing", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* seed(fixture, [assignment("remove-bob", bobScope, MemberPermissions.Remove)]);
    const before = yield* fixture.snapshot;
    const failure = new WorkspaceStore.Failure({ operation: "get", cause: "unavailable" });
    expect(
      yield* run(
        fixture,
        remove(bob.id).pipe(Effect.flip),
        alice,
        {},
        { get: Effect.fail(failure) },
      ),
    ).toBe(failure);
    expect(yield* fixture.snapshot).toEqual(before);
  }),
);

it.effect(
  "removal joins an outer commit, sees staged permission, and rolls back with that commit",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* seed(fixture);
      const granted = assignment("remove-bob", bobScope, MemberPermissions.Remove);
      const program = Effect.gen(function* () {
        const journal = yield* Journal.Journal;
        const memberService = yield* MemberService.MemberService;
        return yield* journal.commit(
          Effect.gen(function* () {
            yield* journal
              .publish(AssignmentFacts.Created, {
                assignmentId: granted.id,
                workspaceId,
                memberId: alice.memberId,
                source: granted.source,
              })
              .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
            return yield* memberService.remove(bob.id);
          }),
        );
      });
      const before = yield* fixture.snapshot;
      const failure = yield* run(
        fixture,
        Effect.gen(function* () {
          const journal = yield* Journal.Journal;
          return yield* journal.commit(
            Effect.gen(function* () {
              yield* program;
              return yield* Effect.fail("abort");
            }),
          );
        }).pipe(Effect.flip),
      );
      expect(failure).toBe("abort");
      expect(yield* fixture.snapshot).toEqual(before);
      const attempts = yield* fixture.attempts;
      expect(yield* run(fixture, program)).toMatchObject({ status: "removed" });
      expect(yield* fixture.attempts).toBe(attempts + 1);
      const snapshot = yield* fixture.snapshot;
      expect(
        [...snapshot.logs.values()].flatMap((batches) => batches.flatMap((batch) => batch.entries)),
      ).toHaveLength(2);
    }),
);

it.effect(
  "listing returns the memberships the actor may read, including removed ones, and nothing more",
  () =>
    Effect.gen(function* () {
      const list = Effect.flatMap(
        MemberService.MemberService,
        (memberService) => memberService.list,
      );
      const fixture = yield* make();
      yield* seed(fixture, [assignment("read-bob")]);
      // An exact grant sees that member only; the actor's own record needs its own grant.
      expect((yield* run(fixture, list)).map((member) => member.id)).toEqual([bob.id]);
      // Without any read grant the listing is empty rather than denied.
      expect(yield* run(fixture, list, agent)).toEqual([]);
      // A workspace-scoped grant sees everyone, and removal keeps the record listed.
      yield* fixture.store.transaction(
        Effect.gen(function* () {
          yield* fixture.assignments.insert(
            assignment("read-all", Scope.Scope.cases.Workspace.make({ workspaceId })),
          );
          yield* fixture.members.markRemoved(bob.id);
        }),
      );
      const statuses = new Map(
        (yield* run(fixture, list)).map((member) => [member.id, member.status] as const),
      );
      expect(statuses).toEqual(
        new Map([
          [alice.memberId, "active"],
          [agent.memberId, "active"],
          [bob.id, "removed"],
        ]),
      );
      // A removed actor cannot list at all.
      yield* fixture.store.transaction(fixture.members.markRemoved(alice.memberId));
      expect(yield* run(fixture, Effect.flip(list))).toMatchObject({
        _tag: "CoreError.Denied",
        reason: { _tag: "InvalidActor", reason: "membership-removed" },
      });
    }),
);
