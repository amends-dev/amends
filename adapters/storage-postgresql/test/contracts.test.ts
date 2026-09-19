import { expect } from "bun:test";
import { Assignment, Grant, Role, Scope, Target } from "@amends/core/authorization";
import { Entry, Store } from "@amends/core/journal";
import { Identity } from "@amends/core/identity";
import { Invitation, Member, MemberPermissions, Workspace } from "@amends/core/workspace";
import { DateTime, Effect, Option } from "effect";
import {
  type Bound,
  boundTo,
  initialized,
  inDatabase,
  workspaceId,
  otherWorkspaceId,
  setup,
} from "./support.ts";
const { it, withDatabase } = await setup();

const permission = MemberPermissions.Read.name;
const roleId = Role.Id.make("contract-role");
const localScope = (
  kind: "Workspace" | "TargetWorkspace" | "TargetMember",
  id: Workspace.Id,
  memberId: Member.Id,
): Scope.Value => {
  if (kind === "Workspace") return Scope.Value.cases.Workspace.make({ workspaceId: id });
  return Scope.Value.cases.Target.make({
    target:
      kind === "TargetMember"
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

it("role validation rejects invalid inserts and edits without poisoning the transaction or record", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
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
              yield* Effect.flip(bound.roles.setPermissions(roleId, [permission, permission])),
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
  ));

it.each([
  ["Role", "Workspace"],
  ["Role", "TargetWorkspace"],
  ["Role", "TargetMember"],
  ["Direct", "Workspace"],
  ["Direct", "TargetWorkspace"],
  ["Direct", "TargetMember"],
] as const)(
  "%s assignments reject a foreign %s scope before converting columns",
  async (kind, scopeKind) =>
    withDatabase(async (location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId);
          const { workspace } = yield* seed(bound);
          const record: Assignment.Record = {
            id: Assignment.Id.make("contract-assignment"),
            workspaceId,
            memberId: workspace.ownerMemberId,
            status: "active",
            source: source(kind, localScope(scopeKind, otherWorkspaceId, workspace.ownerMemberId)),
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

it.each(["missing", "blank"] as const)(
  "invitations reject a %s role and invalid expiry without leaving partial rows",
  async (invalidRole) =>
    withDatabase(async (location) =>
      inDatabase(
        location,
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

it("an uncaught schema conflict rolls back earlier store writes in the same transaction", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
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
  ));

it("checkpoint validation rejects invalid progress without leaving a partial checkpoint", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const bound = yield* boundTo(workspaceId);
        yield* initialized(bound);
        const saved = yield* bound.store.transaction(
          Effect.gen(function* () {
            const native = yield* Store.Transaction;
            const [entry] = yield* native.append({
              logId: Entry.LogId.make("checkpoint-contract"),
              payloads: [new Uint8Array([1])],
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
              yield* Effect.flip(bound.checkpoints.set({ ...key, version: Number.NaN }, cursor)),
            ).toMatchObject({ _tag: "JournalStore.Conflict", operation: "checkpoint.set" });
            expect(yield* bound.checkpoints.get(key)).toEqual(Option.none());
            yield* bound.checkpoints.set(key, cursor);
            return { key, cursor };
          }),
        );
        expect(yield* bound.checkpoints.get(saved.key)).toEqual(Option.some(saved.cursor));
      }),
    ),
  ));

it("workspace names are required at the store boundary without partial writes", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
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
  ));

it("ownership storage validates transitions and changes only the owner when the previous owner matches", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
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
              expect(yield* Effect.flip(bound.workspace.transferOwnership(input))).toMatchObject({
                _tag: "WorkspaceStore.Conflict",
              });
              expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
            }
            const invalid = { ...change };
            Reflect.set(invalid, "ownerMemberId", "");
            expect(yield* Effect.flip(bound.workspace.transferOwnership(invalid))).toMatchObject({
              _tag: "WorkspaceStore.Conflict",
            });
            yield* bound.workspace.transferOwnership(change);
            expect(yield* Effect.flip(bound.workspace.transferOwnership(change))).toMatchObject({
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
              missing.workspace.transferOwnership({ ...change, workspaceId: otherWorkspaceId }),
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
  ));
