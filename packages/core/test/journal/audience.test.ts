import { Audience, Fact, Subject } from "@amends-dev/core/journal";
import {
  Group,
  GroupFollow,
  GroupFollowFacts,
  GroupMembership,
  GroupMembershipFacts,
} from "@amends-dev/core/group";
import { Identity } from "@amends-dev/core/identity";
import { Member, MemberFacts, Workspace } from "@amends-dev/core/workspace";
import { expect, it } from "@effect/vitest";
import { DateTime, Effect, Schema } from "effect";

const workspaceId = Workspace.Id.make("workspace-one");
const groupId = Group.Id.make("group-one");
const memberId = Member.Id.make("member-one");
const at = DateTime.makeUnsafe("2026-09-23T12:00:00.000Z");
const Payload = Schema.Struct({ scopes: Schema.Array(Schema.String) });
const Declared = Fact.make("test.declared", {
  version: 1,
  payload: Payload,
  subject: () => Subject.make("test", "entity"),
  audience: ({ scopes }) => scopes.map((scope) => Audience.Scope.make(scope)),
});
const Undeclared = Fact.make("test.undeclared", {
  version: 1,
  payload: Payload,
  subject: () => Subject.make("test", "entity"),
});

it("scopes name the workspace or one kind and ID, which may contain colons", () => {
  expect(Audience.workspace).toBe("workspace");
  expect(Audience.make("group", "a:b")).toBe("group:a:b");
  expect(() => Audience.make("Group", "a")).toThrow();
  expect(() => Audience.make("group", "")).toThrow();
  for (const scope of ["workspace", "group:a", "human:alice"])
    expect(Schema.is(Audience.Scope)(scope)).toBe(true);
  for (const scope of ["", "Group:a", "group:", "group", "workspaces"])
    expect(Schema.is(Audience.Scope)(scope)).toBe(false);
});

it.effect("a fact without a declared audience stays internal", () =>
  Effect.gen(function* () {
    expect(yield* Fact.makeAudience(Undeclared, { scopes: ["workspace"] })).toEqual([]);
    expect(Audience.internal).toEqual([]);
  }),
);

it.effect("a declared audience is validated with its payload", () =>
  Effect.gen(function* () {
    expect(yield* Fact.makeAudience(Declared, { scopes: ["workspace", "group:a"] })).toEqual([
      "workspace",
      "group:a",
    ]);
    const duplicate = yield* Effect.flip(
      Fact.makeAudience(Declared, { scopes: ["group:a", "group:a"] }),
    );
    expect(Schema.isSchemaError(duplicate)).toBe(true);
    const invalid = yield* Effect.flip(
      Fact.makeAudience(Declared, { scopes: 1 } as unknown as typeof Payload.Type),
    );
    expect(Schema.isSchemaError(invalid)).toBe(true);
  }),
);

it.effect(
  "group admissions reach the group and the admitted member; follows only the follower",
  () =>
    Effect.gen(function* () {
      const group = Group.audienceOf(groupId);
      const member = Member.audienceOf(memberId);
      expect(group).toBe("group:group-one");
      expect(member).toBe("member:member-one");
      const admission = {
        id: GroupMembership.Id.make("admission"),
        workspaceId,
        groupId,
        memberId,
        admittedAt: at,
        status: "active" as const,
      };
      expect(yield* Fact.makeAudience(GroupMembershipFacts.Added, admission)).toEqual([
        group,
        member,
      ]);
      expect(
        yield* Fact.makeAudience(GroupMembershipFacts.Removed, {
          workspaceId,
          groupId,
          membershipId: admission.id,
          memberId,
          reason: "left",
        }),
      ).toEqual([group, member]);
      expect(
        yield* Fact.makeAudience(GroupFollowFacts.Ended, {
          workspaceId,
          groupId,
          followId: GroupFollow.Id.make("follow"),
          memberId,
        }),
      ).toEqual([member]);
      const human: Identity.MemberReference = { _tag: "Human", id: Identity.HumanId.make("alice") };
      expect(Identity.audienceOf(human)).toBe("human:alice");
      expect(Identity.audienceOf({ _tag: "Agent", id: Identity.AgentId.make("alice") })).toBe(
        "agent:alice",
      );
      expect(yield* Fact.makeAudience(MemberFacts.Removed, { workspaceId, memberId })).toEqual([
        Audience.workspace,
      ]);
    }),
);
