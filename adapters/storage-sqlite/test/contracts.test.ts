import { expect, test as it } from "bun:test";
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
  temporary as withDatabase,
} from "./support.ts";

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

it.each(["Workspace", "TargetWorkspace", "TargetMember"] as const)(
  "invitations reject a foreign %s grant and invalid expiry without leaving partial rows",
  async (scopeKind) =>
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
              grants: [
                Grant.Value.make({
                  permission,
                  scope: localScope(scopeKind, otherWorkspaceId, workspace.ownerMemberId),
                }),
              ],
            },
            state: { _tag: "Pending" },
          };
          const valid: Invitation.Record = {
            state: record.state,
            details: {
              ...record.details,
              grants: [
                Grant.Value.make({
                  permission,
                  scope: localScope(scopeKind, workspaceId, workspace.ownerMemberId),
                }),
              ],
            },
          };
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
