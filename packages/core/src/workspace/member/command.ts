import { Context, Crypto, type DateTime, Effect, Layer, Option } from "effect";
import { AssignmentCommand } from "../../authorization/assignment/command.ts";
import type { Role } from "../../authorization/role/role.ts";
import { Group } from "../../group/group.ts";
import { GroupMembershipFacts } from "../../group/membership/facts.ts";
import { GroupMembership } from "../../group/membership/membership.ts";
import { GroupStore } from "../../group/store.ts";
import type { Identity } from "../../identity/identity.ts";
import { Journal } from "../../journal/journal.ts";
import type { Publication } from "../../journal/publication.ts";
import { Store } from "../../journal/store.ts";
import { MemberFacts } from "./facts.ts";
import { Member } from "./member.ts";

export type Error = AssignmentCommand.Error | GroupStore.Failure;

/** A member to add: who they are, what they are called, the role they start with, and when. */
export interface NewMember {
  readonly identity: Identity.MemberReference;

  /** What people in the workspace call them; without one, clients show their identity. */
  readonly name?: Member.Name | undefined;

  /** The role the member holds across the workspace from the start. */
  readonly roleId: Role.Id;

  /** When the member joined, which the general group admits them at. */
  readonly joinedAt: DateTime.Utc;
}

export interface Interface {
  /**
   * Add a member, as a person accepting an invitation or an agent being created joins: a new
   * membership, its role across the workspace, and its place in the general group, which every
   * member joins. The caller owns authorization and delegation, and the commit.
   */
  readonly add: (
    member: NewMember,
  ) => Effect.Effect<Member.Record, Error, Store.Transaction | Publication.Service>;
}
/** @effect-expect-leaking Transaction */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/workspace/member/command/Service",
) {}

/** @category constructors */
export const make = Effect.fn("MemberCommand.make")(function* () {
  const assignmentCommand = yield* AssignmentCommand.Service;
  const groupStore = yield* GroupStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  const add = Effect.fn("MemberCommand.add")(function* (member: NewMember) {
    const added: Member.Record = {
      id: Member.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      identity: member.identity,
      ...(member.name === undefined ? {} : { name: member.name }),
      status: "active",
    };
    yield* journal.publish(MemberFacts.Added, {
      memberId: added.id,
      workspaceId,
      identity: added.identity,
      ...(added.name === undefined ? {} : { name: added.name }),
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

  return Service.of({ add });
});

/** Internal writes shared by accepting invitations and creating agents. @category layers */
export const layer = Layer.effect(Service, make());

export * as MemberCommand from "./command.ts";
