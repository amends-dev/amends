import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import * as AssignmentFacts from "../../src/authorization/AssignmentFacts.ts";
import * as Assignment from "../../src/authorization/Assignment.ts";
import * as Grant from "../../src/authorization/Grant.ts";
import * as Permission from "../../src/authorization/Permission.ts";
import * as Role from "../../src/authorization/Role.ts";
import * as Scope from "../../src/authorization/Scope.ts";
import * as Target from "../../src/authorization/Target.ts";
import * as Codec from "../../src/journal/Codec.ts";
import * as Member from "../../src/workspace/Member.ts";
import * as MemberPermissions from "../../src/workspace/MemberPermissions.ts";
import * as Workspace from "../../src/workspace/Workspace.ts";

const workspaceId = Workspace.Id.make("workspace-1");
const recipientId = Member.Id.make("recipient");
const targetMemberId = Member.Id.make("target-member");
const roleId = Role.Id.make("role-1");
const ManageWorkspace = Permission.make("test.workspace.manage", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});
const sourcesIn = (workspaceId: Workspace.Id): ReadonlyArray<Assignment.Source> => {
  const scopedPermissions = [
    [MemberPermissions.Remove, Scope.Scope.cases.Workspace.make({ workspaceId })],
    [
      MemberPermissions.Remove,
      Scope.Scope.cases.Target.make({
        target: Target.Reference.cases.Member.make({ workspaceId, memberId: targetMemberId }),
      }),
    ],
    [
      ManageWorkspace,
      Scope.Scope.cases.Target.make({
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
it.effect(
  "assignments retain role references or direct grants within the recipient's workspace",
  () =>
    Effect.gen(function* () {
      const decode = Schema.decodeUnknownEffect(Assignment.Assignment);
      for (const source of sourcesIn(workspaceId)) {
        for (const status of Assignment.Status.literals) {
          const input = {
            id: Assignment.Id.make(`assignment-${source._tag}-${status}`),
            workspaceId,
            memberId: recipientId,
            source,
            status,
          };
          expect(Assignment.Assignment.make(input)).toEqual(input);
          expect(yield* decode(input)).toEqual(input);
        }
      }
    }),
);

it.effect(
  "both assignment sources reject foreign workspace and exact-target scopes, including after revocation",
  () =>
    Effect.gen(function* () {
      const decode = Schema.decodeUnknownEffect(Assignment.Assignment);
      for (const source of sourcesIn(Workspace.Id.make("workspace-2"))) {
        for (const status of Assignment.Status.literals) {
          const input = {
            id: Assignment.Id.make(`assignment-${source._tag}-${status}`),
            workspaceId,
            memberId: recipientId,
            source,
            status,
          };
          expect(() => Assignment.Assignment.make(input)).toThrow("Schema validation failed");
          const error = yield* decode(input).pipe(Effect.flip);
          expect(error.message).toContain("Assignment scope must belong to its workspace");
          expect(error.message).toContain('["source"]');
        }
      }
    }),
);

it.effect("assignment creation facts preserve workspace checks through the journal codec", () =>
  Effect.gen(function* () {
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
      const bytes = yield* codec.encode(payload);
      expect(yield* codec.decode(bytes)).toEqual(payload);
    }
    for (const source of sourcesIn(Workspace.Id.make("workspace-2"))) {
      const payload = { ...identifiers, source };
      const error = yield* codec.encode(payload).pipe(Effect.flip);
      expect(error.message).toContain("Assignment scope must belong to its workspace");
      const corrupt = yield* unchecked.encode(payload);
      const storedError = yield* codec.decode(corrupt).pipe(Effect.flip);
      expect(storedError.message).toContain("Assignment scope must belong to its workspace");
    }
  }),
);
