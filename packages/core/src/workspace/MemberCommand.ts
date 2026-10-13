/**
 * The write to memberships that operations share, run inside the caller's commit: adding a member.
 * Accepting an invitation and creating an agent both go through `add`; initialization adds the
 * creator itself, before this service exists. The caller owns authorization, delegation, and the
 * commit; this service checks none of them.
 *
 * @since 0.1.0
 */
import { Context, Crypto, type DateTime, Effect, Layer, Option } from "effect";
import * as AssignmentCommand from "../authorization/AssignmentCommand.ts";
import type * as Role from "../authorization/Role.ts";
import * as Group from "../group/Group.ts";
import * as GroupCommand from "../group/GroupCommand.ts";
import * as GroupStore from "../group/GroupStore.ts";
import type * as Identity from "../identity/Identity.ts";
import * as Journal from "../journal/Journal.ts";
import type * as Publication from "../journal/Publication.ts";
import * as Store from "../journal/Store.ts";
import * as MemberFacts from "./MemberFacts.ts";
import * as Member from "./Member.ts";
import type * as StoreError from "../journal/StoreError.ts";

/**
 * What adding a member can fail with: the failures of assigning its role, of reading the general
 * group, and of admitting the member to it.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error = AssignmentCommand.Error | StoreError.StoreError | GroupCommand.AdmitError;

/**
 * A member to add: who they are, what they are called, the role they start with, and when.
 *
 * @category options
 * @since 0.1.0
 */
export interface NewMember {
  /** The human or agent admitted; one identity holds at most one active membership. */
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
 *
 * The write that admits a member, shared by `InvitationService.accept` and `AgentService.create`.
 * Internal: not among `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
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
    ) => Effect.Effect<Member.Member, Error, Store.Transaction | Publication.Publication>;
  }
>()("@amends-dev/core/workspace/MemberCommand") {}

/**
 * Capture bound services; `add` publishes in the caller's commit.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("MemberCommand.make")(function* () {
  const assignmentCommand = yield* AssignmentCommand.AssignmentCommand;
  const groupCommand = yield* GroupCommand.GroupCommand;
  const groupStore = yield* GroupStore.GroupStore;
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;

  const add = Effect.fn("MemberCommand.add")(function* (member: NewMember) {
    const added: Member.Member = {
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
      yield* groupCommand.admitMember(Group.GeneralId, added.id, member.joinedAt);
    return added;
  });

  return MemberCommand.of({ add });
});

/**
 * Provide the member write over the assignment writes, the group store, and the journal.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(MemberCommand, make());
