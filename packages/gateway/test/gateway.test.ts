import { expect, test } from "bun:test";
import { AssignmentStore, Authorization, RoleStore } from "@amends/core/authorization";
import { Actor, Identity } from "@amends/core/identity";
import { Checkpoint, Commit, Store } from "@amends/core/journal";
import {
  Notification,
  NotificationApplication,
  NotificationStore,
} from "@amends/core/notification";
import {
  InvitationStore,
  Member,
  MemberApplication,
  MemberStore,
  Workspace,
  WorkspaceStore,
} from "@amends/core/workspace";
import { Cause, Context, Crypto, Effect, Exit, Layer, Option, Result, Schema } from "effect";
import { GatewayErrors } from "../src/errors.ts";
import { Gateway } from "../src/gateway.ts";
import { WorkspaceStorage } from "../src/storage.ts";

const workspaceId = Workspace.Id.make("workspace");
const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
const agent = Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make("agent") });
const memberId = Member.Id.make("member");
const unexpected = () => Effect.die(new Error("Unexpected storage operation in gateway test"));

interface BindingOptions {
  readonly findActive?: MemberStore.Interface["findActive"];
  readonly read?: Store.Interface["read"];
  readonly memberWorkspaceId?: Workspace.Id;
}

/** Empty journal and explicit host contracts; unexpected writes fail instead of simulating storage. */
const bindings = (options: BindingOptions = {}): Context.Context<WorkspaceStorage.Bindings> =>
  Context.make(
    Store.Service,
    Store.Service.of({
      transaction: (program) =>
        program.pipe(
          Effect.provideService(Store.Transaction, {
            id: Commit.Id.make("replay"),
            append: unexpected,
          }),
        ),
      get: unexpected,
      read: options.read ?? (() => Effect.succeed([])),
      waitForAppend: unexpected,
    }),
  ).pipe(
    Context.add(
      Checkpoint.Service,
      Checkpoint.Service.of({ get: () => Effect.succeedNone, set: unexpected }),
    ),
    Context.add(
      WorkspaceStore.Service,
      WorkspaceStore.Service.of({
        workspaceId,
        get: unexpected(),
        insert: unexpected,
        transferOwnership: unexpected,
      }),
    ),
    Context.add(
      MemberStore.Service,
      MemberStore.Service.of({
        workspaceId: options.memberWorkspaceId ?? workspaceId,
        get: unexpected,
        findActive:
          options.findActive ??
          ((identity) =>
            Effect.succeedSome({ id: memberId, workspaceId, identity, status: "active" })),
        list: unexpected(),
        insert: unexpected,
        markRemoved: unexpected,
      }),
    ),
    Context.add(
      InvitationStore.Service,
      InvitationStore.Service.of({
        workspaceId,
        get: unexpected,
        list: unexpected(),
        listPendingByRecipient: unexpected,
        insert: unexpected,
        settle: unexpected,
      }),
    ),
    Context.add(
      NotificationStore.Service,
      NotificationStore.Service.of({
        workspaceId,
        get: unexpected,
        listByRecipient: unexpected,
        listPendingByRecipient: unexpected,
        insert: unexpected,
      }),
    ),
    Context.add(
      RoleStore.Service,
      RoleStore.Service.of({
        workspaceId,
        get: unexpected,
        insert: unexpected,
        rename: unexpected,
        setPermissions: unexpected,
      }),
    ),
    Context.add(
      AssignmentStore.Service,
      AssignmentStore.Service.of({
        workspaceId,
        get: unexpected,
        listActiveByMember: unexpected,
        listActiveByRole: unexpected,
        insert: unexpected,
        markRevoked: unexpected,
      }),
    ),
  );

const host = (storage: WorkspaceStorage.Interface) =>
  Layer.mergeAll(
    Layer.succeed(WorkspaceStorage.Service, storage),
    Layer.succeed(
      Crypto.Crypto,
      Crypto.make({ randomBytes: (size) => new Uint8Array(size), digest: unexpected }),
    ),
  );

const run = <A, E>(
  program: (gateway: Gateway.Interface) => Effect.Effect<A, E>,
  options: BindingOptions = {},
) =>
  Effect.runPromise(
    Effect.flatMap(Gateway.make(), program).pipe(
      Effect.provide(
        host({
          forWorkspace: () => Effect.succeed(bindings(options)),
        }),
      ),
    ),
  );

const defect = <A, E>(exit: Exit.Exit<A, E>): unknown => {
  if (!Exit.isFailure(exit)) throw new Error("Expected a failed exit");
  const found = Cause.findDie(exit.cause);
  if (!Result.isSuccess(found)) throw new Error("Expected a defect");
  expect(Option.isNone(Cause.findErrorOption(exit.cause))).toBe(true);
  return found.success.defect;
};

test.each(["inWorkspace", "asMember"] as const)(
  "%s maps operation failures to public outcomes",
  async (entry) => {
    await run((gateway) =>
      Effect.gen(function* () {
        const enter = <A, E>(program: Effect.Effect<A, E>) =>
          entry === "inWorkspace"
            ? gateway.inWorkspace(workspaceId, program)
            : gateway.asMember(workspaceId, alice, program);

        const conflict = yield* Effect.flip(
          enter(
            Effect.fail(new Store.Conflict({ operation: "append", message: "Changed position" })),
          ),
        );
        expect(conflict).toMatchObject({
          _tag: "Gateway.Conflict",
          workspaceId,
          operation: "append",
          message: "Changed position",
        });

        const uncertain = yield* Effect.flip(
          enter(
            Effect.fail(
              new Store.CommitUncertain({
                commitId: Commit.Id.make("commit"),
                cause: new Error("driver detail"),
              }),
            ),
          ),
        );
        expect(yield* Schema.encodeEffect(GatewayErrors.PublicError)(uncertain)).toEqual({
          _tag: "Gateway.Uncertain",
          workspaceId,
          commitId: "commit",
        });

        const invalid = yield* Effect.flip(enter(Schema.decodeEffect(Schema.NonEmptyString)("")));
        expect(invalid).toMatchObject({ _tag: "Gateway.InvalidInput" });
        const mismatch = yield* Effect.flip(
          enter(
            Effect.fail(
              new Authorization.WorkspaceMismatch({
                expectedWorkspaceId: workspaceId,
                actualWorkspaceId: Workspace.Id.make("other"),
              }),
            ),
          ),
        );
        expect(mismatch).toMatchObject({
          _tag: "Gateway.InvalidInput",
          message: "Values must belong to workspace workspace",
        });

        const missing = new MemberApplication.NotFound({ workspaceId, memberId });
        expect(yield* Effect.flip(enter(Effect.fail(missing)))).toBe(missing);
        const missingNotification = new NotificationApplication.NotFound({
          workspaceId,
          notificationId: Notification.Id.make("missing"),
        });
        expect(yield* Effect.flip(enter(Effect.fail(missingNotification)))).toBe(
          missingNotification,
        );
      }),
    );
  },
);

test("unexpected failures and malformed public errors stay defects; interruption stays interruption", async () => {
  await run((gateway) =>
    Effect.gen(function* () {
      const failure = new MemberStore.Failure({
        operation: "get",
        cause: new Error("database detail"),
      });
      expect(
        defect(yield* Effect.exit(gateway.inWorkspace(workspaceId, Effect.fail(failure)))),
      ).toBe(failure);
      const invalidNotification = new NotificationApplication.InvalidResponse({
        message: "Invalid stored notification",
      });
      expect(
        defect(
          yield* Effect.exit(gateway.inWorkspace(workspaceId, Effect.fail(invalidNotification))),
        ),
      ).toBe(invalidNotification);
      const malformed = { _tag: "MemberApplication.NotFound", workspaceId, memberId: 42 };
      expect(
        defect(yield* Effect.exit(gateway.inWorkspace(workspaceId, Effect.fail(malformed)))),
      ).toBe(malformed);
      const interrupted = yield* Effect.exit(gateway.inWorkspace(workspaceId, Effect.interrupt));
      expect(Exit.hasInterrupts(interrupted)).toBe(true);
      expect(Exit.hasDies(interrupted)).toBe(false);
    }),
  );
});

test("construction and projection replay failures are defects before the operation runs", async () => {
  let called = false;
  const operation = Effect.sync(() => {
    called = true;
  });
  const badBindings = await run(
    (gateway) => Effect.exit(gateway.inWorkspace(workspaceId, operation)),
    { memberWorkspaceId: Workspace.Id.make("other") },
  );
  expect(defect(badBindings)).toMatchObject({ _tag: "Authorization.WorkspaceMismatch" });

  const failure = new Store.Failure({ operation: "read", cause: new Error("unavailable") });
  const badReplay = await run(
    (gateway) => Effect.exit(gateway.inWorkspace(workspaceId, operation)),
    { read: () => Effect.fail(failure) },
  );
  expect(defect(badReplay)).toBe(failure);
  expect(called).toBe(false);
});

test.each(["make", "layer"] as const)(
  "gateway %s binds lazily and propagates host binding defects",
  async (construction) => {
    const failure = new Error("Cannot bind workspace");
    const requested: Array<Workspace.Id> = [];
    const storage = WorkspaceStorage.Service.of({
      forWorkspace: (id) =>
        Effect.sync(() => {
          requested.push(id);
        }).pipe(Effect.andThen(Effect.die(failure))),
    });
    const program = (gateway: Gateway.Interface) =>
      Effect.gen(function* () {
        expect(requested).toEqual([]);
        const exit = yield* Effect.exit(gateway.inWorkspace(workspaceId, Effect.void));
        expect(defect(exit)).toBe(failure);
        expect(requested).toEqual([workspaceId]);
      });
    const configured =
      construction === "make"
        ? Effect.flatMap(Gateway.make(), program)
        : Effect.flatMap(Gateway.Service, program).pipe(Effect.provide(Gateway.layer));
    await Effect.runPromise(configured.pipe(Effect.provide(host(storage))));
  },
);

test("one gateway resolves each caller's current membership and stops after revocation", async () => {
  let active = true;
  const seen: Array<Identity.Reference> = [];
  await run(
    (gateway) =>
      Effect.gen(function* () {
        const first = yield* gateway.asMember(workspaceId, alice, Actor.Service);
        const second = yield* gateway.asMember(workspaceId, agent, Actor.Service);
        expect(first).toEqual({ workspaceId, memberId, identity: alice });
        expect(second).toEqual({ workspaceId, memberId, identity: agent });
        active = false;
        let called = false;
        const rejected = yield* Effect.flip(
          gateway.asMember(
            workspaceId,
            alice,
            Effect.sync(() => {
              called = true;
            }),
          ),
        );
        expect(rejected).toMatchObject({ _tag: "Gateway.NotMember", workspaceId });
        expect(called).toBe(false);
        expect(seen).toEqual([alice, agent, alice]);
      }),
    {
      findActive: (identity) =>
        Effect.sync(() => {
          seen.push(identity);
          return active
            ? Option.some({ id: memberId, workspaceId, identity, status: "active" })
            : Option.none();
        }),
    },
  );
});
