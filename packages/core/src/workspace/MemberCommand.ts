import { Context, Crypto, type DateTime, Effect, Layer, Option } from "effect";
import * as AssignmentCommand from "../authorization/AssignmentCommand.ts";
import type * as Role from "../authorization/Role.ts";
import * as Group from "../group/Group.ts";
import * as GroupMembershipFacts from "../group/GroupMembershipFacts.ts";
import * as GroupMembership from "../group/GroupMembership.ts";
import * as GroupStore from "../group/GroupStore.ts";
import type * as Identity from "../identity/Identity.ts";
import * as Journal from "../journal/Journal.ts";
import type * as Publication from "../journal/Publication.ts";
import * as Store from "../journal/Store.ts";
import * as MemberFacts from "./MemberFacts.ts";
import * as Member from "./Member.ts";

export type Error = AssignmentCommand.Error | GroupStore.Failure;

/** A member to add: who they are, what they are called, the role they start with, and when. */
export interface NewMember {
  readonly identity: Identity.MemberReference;

  /** What people in the workspace call them. */
  readonly name: Member.Name;

  /** The role the member holds across the workspace from the start. */
  readonly roleId: Role.Id;

  /** When the member joined, which the general group admits them at. */
  readonly joinedAt: DateTime.Utc;
}

/**
 * @effect-expect-leaking Transaction
 */
export class MemberCommand extends Context.Service<
  MemberCommand,
  {
    /**
     * Add a member, as a person accepting an invitation or an agent being created joins: a new
     * membership, its role across the workspace, and its place in the general group, which every
     * member joins. The caller owns authorization and delegation, and the commit.
     */
    readonly add: (
      member: NewMember,
    ) => Effect.Effect<Member.Record, Error, Store.Transaction | Publication.Publication>;
  }
>()("@amends-dev/core/workspace/member/command/Service") {}

/** @category constructors */
export const make = Effect.fn("MemberCommand.make")(function* () {
  const assignmentCommand = yield* AssignmentCommand.AssignmentCommand;
  const groupStore = yield* GroupStore.GroupStore;
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;

  const add = Effect.fn("MemberCommand.add")(function* (member: NewMember) {
    const added: Member.Record = {
      id: Member.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      identity: member.identity,
      name: member.name,
      status: "active",
    };
    yield* journal.publish(MemberFacts.Added, {
      memberId: added.id,
      workspaceId,
      identity: added.identity,
      name: added.name,
    });
    yield* assignmentCommand.assignRole(added.id, member.roleId);
    // A workspace created before general groups existed has none.
    if (Option.isSome(yield* groupStore.get(Group.GeneralId)))
      yield* journal.publish(GroupMembershipFacts.Added, {
        id: GroupMembership.Id.make(yield* crypto.randomUUIDv4),
        workspaceId,
        groupId: Group.GeneralId,
        memberId: added.id,
        admittedAt: member.joinedAt,
        status: "active",
      });
    return added;
  });

  return MemberCommand.of({ add });
});

/** Internal writes shared by accepting invitations and creating agents. @category layers */
export const layer = Layer.effect(MemberCommand, make());
