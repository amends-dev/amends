import { expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import { AssignmentFacts } from "../../src/authorization/assignment/facts.ts";
import { Assignment } from "../../src/authorization/assignment/assignment.ts";
import { Grant } from "../../src/authorization/grant.ts";
import { Permission } from "../../src/authorization/permission.ts";
import { Role } from "../../src/authorization/role/role.ts";
import { Scope } from "../../src/authorization/scope.ts";
import { Target } from "../../src/authorization/target.ts";
import { Codec } from "../../src/journal/codec.ts";
import { Member } from "../../src/workspace/member/member.ts";
import { MemberPermissions } from "../../src/workspace/member/permissions.ts";
import { Workspace } from "../../src/workspace/workspace.ts";

const workspaceId = Workspace.Id.make("workspace-1");
const recipientId = Member.Id.make("recipient");
const targetMemberId = Member.Id.make("target-member");
const roleId = Role.Id.make("role-1");
const ManageWorkspace = Permission.make("test.workspace.manage", { targetKind: "Workspace" });

const sourcesIn = (workspaceId: Workspace.Id): ReadonlyArray<Assignment.Source> => {
  const scopedPermissions = [
    [MemberPermissions.Remove, Scope.Value.cases.Workspace.make({ workspaceId })],
    [
      MemberPermissions.Remove,
      Scope.Value.cases.Target.make({
        target: Target.Reference.cases.Member.make({ workspaceId, memberId: targetMemberId }),
      }),
    ],
    [
      ManageWorkspace,
      Scope.Value.cases.Target.make({
        target: Target.Reference.cases.Workspace.make({ workspaceId }),
      }),
    ],
  ] as const;
  const sources: Array<Assignment.Source> = [];
  for (const [permission, scope] of scopedPermissions) {
    sources.push(
      Assignment.Source.cases.Role.make({ roleId, scope }),
      Assignment.Source.cases.Direct.make({ grant: Grant.make(permission, scope) }),
    );
  }
  return sources;
};

test("assignments retain role references or direct grants within the recipient's workspace", async () => {
  const decode = Schema.decodeUnknownEffect(Assignment.Record);
  for (const source of sourcesIn(workspaceId)) {
    for (const status of Assignment.Status.literals) {
      const input = {
        id: Assignment.Id.make(`assignment-${source._tag}-${status}`),
        workspaceId,
        memberId: recipientId,
        source,
        status,
      };
      expect(Assignment.Record.make(input)).toEqual(input);
      expect(await Effect.runPromise(decode(input))).toEqual(input);
    }
  }
});

test("both assignment sources reject foreign workspace and exact-target scopes, including after revocation", async () => {
  const decode = Schema.decodeUnknownEffect(Assignment.Record);
  for (const source of sourcesIn(Workspace.Id.make("workspace-2"))) {
    for (const status of Assignment.Status.literals) {
      const input = {
        id: Assignment.Id.make(`assignment-${source._tag}-${status}`),
        workspaceId,
        memberId: recipientId,
        source,
        status,
      };
      expect(() => Assignment.Record.make(input)).toThrow("Schema validation failed");
      const error = await Effect.runPromise(decode(input).pipe(Effect.flip));
      expect(error.message).toContain("Assignment scope must belong to its workspace");
      expect(error.message).toContain('["source"]');
    }
  }
});

test("assignment creation facts preserve workspace checks through the journal codec", async () => {
  const codec = Codec.make(AssignmentFacts.Created);
  // Encode invalid stored data without the cross-field check to exercise replay decoding.
  const unchecked = Codec.makeForSchema(Schema.Struct(AssignmentFacts.Created.payload.fields));
  const identifiers = {
    assignmentId: Assignment.Id.make("assignment-1"),
    workspaceId,
    memberId: recipientId,
  };

  for (const source of sourcesIn(workspaceId)) {
    const payload = { ...identifiers, source };
    const bytes = await Effect.runPromise(codec.encode(payload));
    expect(await Effect.runPromise(codec.decode(bytes))).toEqual(payload);
  }

  for (const source of sourcesIn(Workspace.Id.make("workspace-2"))) {
    const payload = { ...identifiers, source };
    const error = await Effect.runPromise(codec.encode(payload).pipe(Effect.flip));
    expect(error.message).toContain("Assignment scope must belong to its workspace");

    const corrupt = await Effect.runPromise(unchecked.encode(payload));
    const storedError = await Effect.runPromise(codec.decode(corrupt).pipe(Effect.flip));
    expect(storedError.message).toContain("Assignment scope must belong to its workspace");
  }
});
