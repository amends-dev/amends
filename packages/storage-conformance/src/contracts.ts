import { Assignment, Grant, Role, Scope, Target } from "@amends-dev/core/authorization";
import { Group } from "@amends-dev/core/group";
import { Identity } from "@amends-dev/core/identity";
import { Checkpoint, Entry, Store } from "@amends-dev/core/journal";
import { ThreadId } from "@amends-dev/core/thread";
import { Invitation, Member, MemberPermissions, Workspace } from "@amends-dev/core/workspace";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Option } from "effect";
import type { Harness } from "./harness.ts";
import {
  bob,
  type Bound,
  boundTo,
  charlie,
  otherWorkspaceId,
  runHost,
  Support,
  workspaceId,
} from "./support.ts";

/** Direct store calls: validation, rejection without partial writes, and round trips. */

export const contracts = (harness: Harness) => {
  const { initialized } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: store contracts`, () => {
    const permission = MemberPermissions.Read.name;
    const roleId = Role.Id.make("contract-role");
    const localScope = (
      kind: "Workspace" | "TargetWorkspace" | "TargetMember" | "TargetThread" | "TargetGroup",
      id: Workspace.Id,
      memberId: Member.Id,
    ): Scope.Value => {
      if (kind === "Workspace") return Scope.Value.cases.Workspace.make({ workspaceId: id });
      return Scope.Value.cases.Target.make({
        target:
          kind === "TargetGroup"
            ? Target.Reference.cases.Group.make({
                workspaceId: id,
                groupId: Group.Id.make("group"),
              })
            : kind === "TargetThread"
              ? Target.Reference.cases.Thread.make({
                  workspaceId: id,
                  threadId: ThreadId.Id.make("thread"),
                })
              : kind === "TargetMember"
                ? Target.Reference.cases.Member.make({ workspaceId: id, memberId })
                : Target.Reference.cases.Workspace.make({ workspaceId: id }),
      });
    };
    const source = (kind: "Role" | "Direct", scope: Scope.Value): Assignment.Source =>
      kind === "Role"
        ? Assignment.Source.cases.Role.make({ roleId, scope })
        : Assignment.Source.cases.Direct.make({ grant: Grant.Value.make({ permission, scope }) });
    const seed = (bound: Bound) =>
      Effect.gen(function* () {
        const workspace = yield* initialized(bound);
        const role = Role.Record.make({
          id: roleId,
          workspaceId,
          name: "Readers",
          permissions: [permission],
        });
        yield* bound.store.transaction(bound.roles.insert(role));
        return { workspace, role };
      });
    it.effect(
      "role validation rejects invalid inserts and edits without poisoning the transaction or record",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              const { role } = yield* seed(bound);
              yield* bound.store.transaction(
                Effect.gen(function* () {
                  for (const record of [
                    { ...role, id: Role.Id.make("invalid"), name: "" },
                    { ...role, id: Role.Id.make("invalid"), permissions: [permission, permission] },
                  ]) {
                    expect(yield* Effect.flip(bound.roles.insert(record))).toMatchObject({
                      _tag: "RoleStore.Conflict",
                      operation: "insert",
                    });
                  }
                  expect(yield* bound.roles.get(Role.Id.make("invalid"))).toEqual(Option.none());
                  expect(yield* Effect.flip(bound.roles.rename(roleId, ""))).toMatchObject({
                    _tag: "RoleStore.Conflict",
                    operation: "rename",
                  });
                  expect(
                    yield* Effect.flip(
                      bound.roles.setPermissions(roleId, [permission, permission]),
                    ),
                  ).toMatchObject({ _tag: "RoleStore.Conflict", operation: "setPermissions" });
                  expect(yield* bound.roles.get(roleId)).toEqual(Option.some(role));
                  yield* bound.roles.rename(roleId, "Renamed");
                  yield* bound.roles.setPermissions(roleId, []);
                }),
              );
              expect(yield* bound.roles.get(roleId)).toEqual(
                Option.some({ ...role, name: "Renamed", permissions: [] }),
              );
            }),
          ),
        ),
    );

    it.effect.each([
      ["Role", "Workspace"],
      ["Role", "TargetWorkspace"],
      ["Role", "TargetMember"],
      ["Role", "TargetThread"],
      ["Role", "TargetGroup"],
      ["Direct", "Workspace"],
      ["Direct", "TargetWorkspace"],
      ["Direct", "TargetMember"],
      ["Direct", "TargetThread"],
      ["Direct", "TargetGroup"],
    ] as const)(
      "%s assignments reject a foreign %s scope before converting columns",
      ([kind, scopeKind]) =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              const { workspace } = yield* seed(bound);
              const record: Assignment.Record = {
                id: Assignment.Id.make("contract-assignment"),
                workspaceId,
                memberId: workspace.ownerMemberId,
                status: "active",
                source: source(
                  kind,
                  localScope(scopeKind, otherWorkspaceId, workspace.ownerMemberId),
                ),
              };
              const valid: Assignment.Record = {
                id: record.id,
                workspaceId: record.workspaceId,
                memberId: record.memberId,
                status: record.status,
                source: source(kind, localScope(scopeKind, workspaceId, workspace.ownerMemberId)),
              };
              yield* bound.store.transaction(
                Effect.gen(function* () {
                  expect(yield* Effect.flip(bound.assignments.insert(record))).toMatchObject({
                    _tag: "AssignmentStore.Conflict",
                    operation: "insert",
                  });
                  expect(yield* bound.assignments.get(record.id)).toEqual(Option.none());
                  yield* bound.assignments.insert(valid);
                }),
              );
              expect(yield* bound.assignments.get(record.id)).toEqual(Option.some(valid));
            }),
          ),
        ),
    );

    it.effect.each(["missing", "blank"] as const)(
      "invitations reject a %s role and invalid expiry without leaving partial rows",
      (invalidRole) =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              const { workspace } = yield* seed(bound);
              const issuedAt = DateTime.makeUnsafe("2026-09-18T12:00:00Z");
              const record: Invitation.Record = {
                details: {
                  id: Invitation.Id.make("contract-invitation"),
                  workspaceId,
                  recipientId: Identity.HumanId.make("recipient"),
                  inviterMemberId: workspace.ownerMemberId,
                  issuedAt,
                  expiresAt: DateTime.add(issuedAt, { hours: 1 }),
                  roleId,
                },
                state: { _tag: "Pending" },
              };
              const valid: Invitation.Record = {
                state: record.state,
                details: {
                  ...record.details,
                  roleId,
                },
              };
              Reflect.set(record.details, "roleId", invalidRole === "missing" ? undefined : "");
              yield* bound.store.transaction(
                Effect.gen(function* () {
                  expect(yield* Effect.flip(bound.invitations.insert(record))).toMatchObject({
                    _tag: "InvitationStore.Conflict",
                    operation: "insert",
                  });
                  expect(
                    yield* Effect.flip(
                      bound.invitations.insert({
                        state: valid.state,
                        details: { ...valid.details, expiresAt: issuedAt },
                      }),
                    ),
                  ).toMatchObject({ _tag: "InvitationStore.Conflict", operation: "insert" });
                  expect(yield* bound.invitations.get(record.details.id)).toEqual(Option.none());
                  yield* bound.invitations.insert(valid);
                }),
              );
              expect(yield* bound.invitations.get(record.details.id)).toEqual(Option.some(valid));
            }),
          ),
        ),
    );

    it.effect(
      "an uncaught schema conflict rolls back earlier store writes in the same transaction",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              const { workspace, role } = yield* seed(bound);
              const record: Assignment.Record = {
                id: Assignment.Id.make("rolled-back"),
                workspaceId,
                memberId: workspace.ownerMemberId,
                status: "active",
                source: source(
                  "Direct",
                  localScope("Workspace", otherWorkspaceId, workspace.ownerMemberId),
                ),
              };
              expect(
                yield* Effect.flip(
                  bound.store.transaction(
                    Effect.gen(function* () {
                      yield* bound.roles.rename(roleId, "Must roll back");
                      yield* bound.assignments.insert(record);
                    }),
                  ),
                ),
              ).toMatchObject({ _tag: "AssignmentStore.Conflict" });
              expect(yield* bound.roles.get(roleId)).toEqual(Option.some(role));
              expect(yield* bound.assignments.get(record.id)).toEqual(Option.none());
            }),
          ),
        ),
    );

    it.effect(
      "checkpoint validation rejects invalid progress without leaving a partial checkpoint",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              yield* initialized(bound);
              const saved = yield* bound.store.transaction(
                Effect.gen(function* () {
                  const storeTransaction = yield* Store.Transaction;
                  const [entry] = yield* storeTransaction.append({
                    logId: Entry.LogId.make("checkpoint-contract"),
                    entries: [{ payload: new Uint8Array([1]) }],
                  });
                  if (entry === undefined) return yield* Effect.die("Append returned no entry");
                  const key = { logId: entry.logId, name: "contract-projection", version: 1 };
                  const cursor = {
                    position: entry.position,
                    commitId: entry.commitId,
                    index: entry.index,
                    entryId: entry.id,
                  };
                  expect(
                    yield* Effect.flip(bound.checkpoints.set(key, { ...cursor, index: -1 })),
                  ).toMatchObject({ _tag: "JournalStore.Conflict", operation: "checkpoint.set" });
                  expect(
                    yield* Effect.flip(
                      bound.checkpoints.set({ ...key, version: Number.NaN }, cursor),
                    ),
                  ).toMatchObject({ _tag: "JournalStore.Conflict", operation: "checkpoint.set" });
                  expect(yield* bound.checkpoints.get(key)).toEqual(Option.none());
                  yield* bound.checkpoints.set(key, cursor);
                  return { key, cursor };
                }),
              );
              expect(yield* bound.checkpoints.get(saved.key)).toEqual(Option.some(saved.cursor));
            }),
          ),
        ),
    );

    it.effect("workspace names are required at the store boundary without partial writes", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            const record: Workspace.Record = {
              id: workspaceId,
              name: "Design & Engineering",
              createdBy: Identity.HumanId.make("owner"),
              ownerMemberId: Member.Id.make("owner-member"),
            };
            yield* bound.store.transaction(
              Effect.gen(function* () {
                for (const name of ["", " \t\n", " padded "]) {
                  expect(
                    yield* Effect.flip(
                      bound.workspace.insert({
                        id: record.id,
                        name,
                        createdBy: record.createdBy,
                        ownerMemberId: record.ownerMemberId,
                      }),
                    ),
                  ).toMatchObject({
                    _tag: "WorkspaceStore.Conflict",
                    operation: "insert",
                  });
                  expect(yield* bound.workspace.get).toEqual(Option.none());
                }
                yield* bound.workspace.insert(record);
              }),
            );
            expect(yield* bound.workspace.get).toEqual(Option.some(record));
          }),
        ),
      ),
    );

    it.effect(
      "ownership storage validates transitions and changes only the owner when the previous owner matches",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              const workspace = yield* initialized(bound);
              const next = Member.Id.make("next-owner");
              const change = {
                workspaceId,
                previousOwnerMemberId: workspace.ownerMemberId,
                ownerMemberId: next,
              };
              yield* bound.store.transaction(
                Effect.gen(function* () {
                  for (const input of [
                    { ...change, workspaceId: otherWorkspaceId },
                    { ...change, previousOwnerMemberId: next },
                    { ...change, ownerMemberId: workspace.ownerMemberId },
                  ]) {
                    expect(
                      yield* Effect.flip(bound.workspace.transferOwnership(input)),
                    ).toMatchObject({
                      _tag: "WorkspaceStore.Conflict",
                    });
                    expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
                  }
                  const invalid = { ...change };
                  Reflect.set(invalid, "ownerMemberId", "");
                  expect(
                    yield* Effect.flip(bound.workspace.transferOwnership(invalid)),
                  ).toMatchObject({
                    _tag: "WorkspaceStore.Conflict",
                  });
                  yield* bound.workspace.transferOwnership(change);
                  expect(
                    yield* Effect.flip(bound.workspace.transferOwnership(change)),
                  ).toMatchObject({
                    _tag: "WorkspaceStore.Conflict",
                  });
                }),
              );
              expect(yield* bound.workspace.get).toEqual(
                Option.some({
                  id: workspace.id,
                  name: workspace.name,
                  createdBy: workspace.createdBy,
                  ownerMemberId: next,
                }),
              );
              const missing = yield* boundTo(otherWorkspaceId);
              expect(
                yield* Effect.flip(
                  missing.store.transaction(
                    missing.workspace.transferOwnership({
                      ...change,
                      workspaceId: otherWorkspaceId,
                    }),
                  ),
                ),
              ).toMatchObject({ _tag: "WorkspaceStore.Conflict" });
              const expired = yield* bound.store.transaction(Effect.context<Store.Transaction>());
              expect(
                yield* Effect.flip(
                  bound.workspace.transferOwnership(change).pipe(Effect.provide(expired)),
                ),
              ).toMatchObject({ _tag: "WorkspaceStore.Failure" });
            }),
          ),
        ),
    );

    it.effect("contact identities cannot be persisted as workspace memberships", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            yield* initialized(bound);
            const invalid: Member.Record = {
              id: Member.Id.make("contact-member"),
              workspaceId,
              status: "active",
              identity: Identity.MemberReference.cases.Human.make({
                id: Identity.HumanId.make("external"),
              }),
              name: Member.Name.make("external"),
            };
            Reflect.set(
              invalid,
              "identity",
              Identity.Reference.cases.Contact.make({ id: Identity.ContactId.make("external") }),
            );
            yield* bound.store.transaction(
              Effect.gen(function* () {
                expect(yield* Effect.flip(bound.members.insert(invalid))).toMatchObject({
                  _tag: "MemberStore.Conflict",
                });
                expect(yield* bound.members.get(invalid.id)).toEqual(Option.none());
                yield* bound.members.insert(
                  Object.assign({}, invalid, {
                    identity: Identity.MemberReference.cases.Human.make({
                      id: Identity.HumanId.make("valid"),
                    }),
                  }),
                );
              }),
            );
            expect(Option.isSome(yield* bound.members.get(invalid.id))).toBe(true);
          }),
        ),
      ),
    );

    it.effect(
      "member storage keeps one active membership per identity and never reuses a member ID",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              const workspace = yield* initialized(bound);
              const member = (
                id: string,
                identity: Identity.MemberReference = bob,
              ): Member.Record => ({
                id: Member.Id.make(id),
                workspaceId,
                identity,
                name: Member.Name.make(identity.id),
                status: "active",
              });
              // Each refused write gets its own transaction: a database may abort the rest of one.
              const refused = (record: Member.Record) =>
                Effect.flip(bound.store.transaction(bound.members.insert(record)));
              yield* bound.store.transaction(bound.members.insert(member("bob-first")));
              for (const record of [
                member("bob-second"),
                member("bob-first", charlie),
                member(workspace.ownerMemberId, charlie),
                Object.assign({}, member("foreign", charlie), { workspaceId: otherWorkspaceId }),
                Object.assign({}, member("inactive", charlie), { status: "removed" as const }),
              ])
                expect(yield* refused(record)).toMatchObject({
                  _tag: "MemberStore.Conflict",
                  operation: "insert",
                });
              yield* bound.store.transaction(
                bound.members.markRemoved(Member.Id.make("bob-first")),
              );
              for (const id of ["bob-first", "missing"])
                expect(
                  yield* Effect.flip(
                    bound.store.transaction(bound.members.markRemoved(Member.Id.make(id))),
                  ),
                ).toMatchObject({ _tag: "MemberStore.Conflict", operation: "markRemoved" });
              // A removed membership frees its identity but keeps its ID.
              expect(yield* refused(member("bob-first"))).toMatchObject({
                _tag: "MemberStore.Conflict",
              });
              yield* bound.store.transaction(bound.members.insert(member("bob-second")));
              expect(yield* bound.members.findActive(bob)).toEqual(
                Option.some(member("bob-second")),
              );
              expect(
                (yield* bound.members.list).map(({ id, status }) => [String(id), status]),
              ).toEqual(
                [
                  ["bob-first", "removed"],
                  ["bob-second", "active"],
                  [String(workspace.ownerMemberId), "active"],
                ].toSorted(([left], [right]) => (left! < right! ? -1 : 1)),
              );
            }),
          ),
        ),
    );

    it.effect(
      "workspace, role, and assignment storage refuse reused IDs, including revoked ones",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              const { workspace, role } = yield* seed(bound);
              expect(
                yield* Effect.flip(
                  bound.store.transaction(
                    bound.workspace.insert(Object.assign({}, workspace, { name: "Second" })),
                  ),
                ),
              ).toMatchObject({ _tag: "WorkspaceStore.Conflict", operation: "insert" });
              expect(
                yield* Effect.flip(
                  bound.store.transaction(
                    bound.roles.insert(Object.assign({}, role, { name: "Another" })),
                  ),
                ),
              ).toMatchObject({ _tag: "RoleStore.Conflict", operation: "insert" });
              expect(
                yield* Effect.flip(
                  bound.store.transaction(bound.roles.rename(Role.Id.make("missing"), "Missing")),
                ),
              ).toMatchObject({ _tag: "RoleStore.Conflict", operation: "rename" });
              const assignment: Assignment.Record = {
                id: Assignment.Id.make("reused"),
                workspaceId,
                memberId: workspace.ownerMemberId,
                status: "active",
                source: source(
                  "Role",
                  localScope("Workspace", workspaceId, workspace.ownerMemberId),
                ),
              };
              yield* bound.store.transaction(bound.assignments.insert(assignment));
              yield* bound.store.transaction(bound.assignments.markRevoked(assignment.id));
              for (const operation of [
                bound.assignments.insert(assignment),
                bound.assignments.markRevoked(assignment.id),
                bound.assignments.markRevoked(Assignment.Id.make("missing")),
              ])
                expect(yield* Effect.flip(bound.store.transaction(operation))).toMatchObject({
                  _tag: "AssignmentStore.Conflict",
                });
              expect(yield* bound.assignments.get(assignment.id)).toEqual(
                Option.some(Object.assign({}, assignment, { status: "revoked" })),
              );
              expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
              expect(yield* bound.roles.get(role.id)).toEqual(Option.some(role));
            }),
          ),
        ),
    );

    it.effect("the live register keeps one version per projection name for each log", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            const other = yield* boundTo(otherWorkspaceId);
            const logId = Entry.LogId.make("register-contract");
            const otherLog = Entry.LogId.make("register-other");
            const versions = [
              { name: "first", version: 1 },
              { name: "second", version: 2 },
            ];
            const sorted = (live: ReadonlyArray<Checkpoint.LiveVersion>) =>
              live.toSorted((left, right) => (left.name < right.name ? -1 : 1));
            expect(yield* bound.checkpoints.listLive(logId)).toEqual([]);
            // Writes join the caller's transaction and never run without one.
            expect(
              yield* Effect.flip(
                bound.checkpoints
                  .setLive(logId, versions)
                  .pipe(
                    Effect.provide(
                      yield* bound.store.transaction(Effect.context<Store.Transaction>()),
                    ),
                  ),
              ),
            ).toMatchObject({ _tag: "JournalStore.Failure" });
            yield* bound.store.transaction(bound.checkpoints.setLive(logId, versions));
            expect(sorted(yield* bound.checkpoints.listLive(logId))).toEqual(versions);
            expect(yield* bound.checkpoints.listLive(otherLog)).toEqual([]);
            expect(yield* other.checkpoints.listLive(logId)).toEqual([]);
            // Two versions of one name conflict before any change.
            expect(
              yield* Effect.flip(
                bound.store.transaction(
                  bound.checkpoints.setLive(logId, [
                    { name: "first", version: 1 },
                    { name: "first", version: 2 },
                  ]),
                ),
              ),
            ).toMatchObject({ _tag: "JournalStore.Conflict", operation: "checkpoint.setLive" });
            expect(sorted(yield* bound.checkpoints.listLive(logId))).toEqual(versions);
            // A set replaces the whole register, and a rolled-back one changes nothing.
            yield* bound.store.transaction(
              bound.checkpoints.setLive(logId, [{ name: "first", version: 2 }]),
            );
            expect(yield* bound.checkpoints.listLive(logId)).toEqual([
              { name: "first", version: 2 },
            ]);
            expect(
              yield* Effect.flip(
                bound.store.transaction(
                  Effect.andThen(bound.checkpoints.setLive(logId, []), Effect.fail("undo")),
                ),
              ),
            ).toBe("undo");
            expect(yield* bound.checkpoints.listLive(logId)).toEqual([
              { name: "first", version: 2 },
            ]);
            // Staged changes are visible inside their transaction.
            yield* bound.store.transaction(
              Effect.gen(function* () {
                yield* bound.checkpoints.setLive(logId, []);
                expect(yield* bound.checkpoints.listLive(logId)).toEqual([]);
              }),
            );
            expect(yield* bound.checkpoints.listLive(logId)).toEqual([]);
          }),
        ),
      ),
    );
  });
};
