/**
 * The operations on members an actor calls: reading one or the members it may read, choosing its
 * own name, and removing a member. Adding a member is not among them: accepting an invitation or
 * creating an agent does that, through `MemberCommand`. Each operation authorizes the actor
 * itself, writes inside one journal commit, and reads outside any.
 *
 * @since 0.1.0
 */
import * as Identity from "../identity/Identity.ts";
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import * as Authorization from "../authorization/Authorization.ts";
import * as Delegation from "../authorization/Delegation.ts";
import * as Requirement from "../authorization/Requirement.ts";
import * as Target from "../authorization/Target.ts";
import * as Actor from "../identity/Actor.ts";

import * as GroupCommand from "../group/GroupCommand.ts";
import * as GroupMembershipStore from "../group/GroupMembershipStore.ts";
import * as Journal from "../journal/Journal.ts";
import * as Publication from "../journal/Publication.ts";
import * as Store from "../journal/Store.ts";

import * as InvitationFacts from "./InvitationFacts.ts";
import * as InvitationStore from "./InvitationStore.ts";
import * as MemberFacts from "./MemberFacts.ts";
import * as MemberPermissions from "./MemberPermissions.ts";
import * as MemberStore from "./MemberStore.ts";
import * as Member from "./Member.ts";
import * as WorkspaceStore from "./WorkspaceStore.ts";

import * as CoreError from "../error/CoreError.ts";
import * as Operation from "../operation/Operation.ts";

/**
 * What reading members can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable;

/**
 * What renaming oneself can fail with: what a read can, and what its commit meets.
 *
 * @category errors
 * @since 0.1.0
 */
export type RenameError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain;

/**
 * What removing a member can fail with: the outcomes above, and the delegation rules.
 *
 * @category errors
 * @since 0.1.0
 */
export type RemoveError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain;

/**
 * The member operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class MemberService extends Context.Service<
  MemberService,
  {
    /**
     * Read an active or removed membership after requiring `member.read` on it. Authorization and
     * lookup read current state without opening a transaction, and use an existing commit when
     * there is one. Only authorized callers can receive `CoreError.NotFound`.
     */
    readonly get: (memberId: Member.Id) => Effect.Effect<Member.Member, Error, Actor.Actor>;
    /**
     * List the memberships the actor may read, active and removed. Active membership is required;
     * each record is then included only when `member.read` covers it, so a workspace-scoped grant
     * sees everyone and an exact grant sees that member. One grant resolution decides them all.
     * This does not open a transaction or promise a shared snapshot.
     */
    readonly list: Effect.Effect<ReadonlyArray<Member.Member>, Error, Actor.Actor>;
    /**
     * Remove a member, under `member.remove` on them and the delegation rules: the current owner is
     * `CoreError.Conflict` (`OwnerProtected`), and a member removed already `AlreadyEnded`. One
     * commit publishes the removal, ends every active group admission of the membership, and, for a
     * person, revokes their pending invitations. The record and its grants remain for history;
     * authorization rejects the removed member, and rejoining needs a new invitation and member ID.
     */
    readonly remove: (
      memberId: Member.Id,
    ) => Effect.Effect<Member.Member, RemoveError, Actor.Actor>;
    /**
     * Choose what people in the workspace call the acting member. Anyone active may name
     * themselves, and only themselves; the same name again records nothing.
     */
    readonly rename: (name: Member.Name) => Effect.Effect<Member.Member, RenameError, Actor.Actor>;
  }
>()("@amends-dev/core/workspace/MemberService") {}

const decodeId = Schema.decodeEffect(Member.Id);

/**
 * Construct member operations from workspace services; the caller supplies `Actor.Actor` per call.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("MemberService.make")(function* (): Effect.fn.Return<
  MemberService["Service"],
  never,
  | MemberStore.MemberStore
  | WorkspaceStore.WorkspaceStore
  | InvitationStore.InvitationStore
  | GroupMembershipStore.GroupMembershipStore
  | GroupCommand.GroupCommand
  | Authorization.Authorization
  | Delegation.Delegation
  | Journal.Journal
  | Crypto.Crypto
  | Store.Store
> {
  const memberStore = yield* MemberStore.MemberStore;
  const workspaceStore = yield* WorkspaceStore.WorkspaceStore;
  const invitationStore = yield* InvitationStore.InvitationStore;
  const groupMembershipStore = yield* GroupMembershipStore.GroupMembershipStore;
  const groupCommand = yield* GroupCommand.GroupCommand;
  const authorization = yield* Authorization.Authorization;
  const delegation = yield* Delegation.Delegation;
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;

  const requireMember = Effect.fnUntraced(function* (id: Member.Id) {
    const found = yield* memberStore.get(id);
    if (Option.isNone(found)) return yield* new CoreError.NotFound({ resource: "Member", id });
    return found.value;
  });

  const get = Effect.fn("MemberService.get")(function* (memberId: Member.Id) {
    const id = yield* decodeId(memberId);
    yield* authorization.require([
      Requirement.make(
        MemberPermissions.Read,
        Target.Reference.cases.Member.make({ workspaceId, memberId: id }),
      ),
    ]);
    return yield* requireMember(id);
  }, Operation.report);

  const list = Effect.gen(function* () {
    yield* authorization.require([]);
    const all = yield* memberStore.list;
    // One grant resolution decides every member, rather than one per member.
    const allowed = yield* authorization.permitted(
      all.map((member) =>
        Requirement.make(
          MemberPermissions.Read,
          Target.Reference.cases.Member.make({ workspaceId, memberId: member.id }),
        ),
      ),
    );
    return all.filter((_, index) => allowed[index]);
  }).pipe(Effect.withSpan("MemberService.list"), Operation.report);

  const remove = Effect.fn("MemberService.remove")(
    function* (memberId: Member.Id) {
      const id = yield* decodeId(memberId);
      yield* authorization.require([
        Requirement.make(
          MemberPermissions.Remove,
          Target.Reference.cases.Member.make({ workspaceId, memberId: id }),
        ),
      ]);
      const member = yield* requireMember(id);
      const found = yield* workspaceStore.get;
      if (Option.isNone(found)) return yield* Effect.die("A workspace's record is missing");
      if (found.value.ownerMemberId === id)
        return yield* new CoreError.Conflict({ reason: new CoreError.OwnerProtected() });
      if (member.status === "removed")
        return yield* new CoreError.Conflict({
          reason: new CoreError.AlreadyEnded({ resource: "Member", id: id }),
        });
      yield* delegation.requireRemoval(id);
      const removed = yield* journal.publish(MemberFacts.Removed, { workspaceId, memberId: id });
      yield* Effect.gen(function* () {
        for (const membership of yield* groupMembershipStore.listActiveByMember(id))
          yield* groupCommand.removeMembership(
            {
              workspaceId,
              groupId: membership.groupId,
              membershipId: membership.id,
              memberId: id,
              reason: "workspace-removed",
            },
            removed.provenance.occurredAt,
          );
      }).pipe(Publication.withCause(removed, removed.provenance.occurredAt));
      if (Identity.MemberReference.isAnyOf(["Human"])(member.identity)) {
        const recipientId = member.identity.id;
        const actor = yield* Actor.Actor;
        const revokedAt = yield* DateTime.now;
        yield* Effect.gen(function* () {
          for (const invitation of yield* invitationStore.listPendingByRecipient(recipientId))
            yield* journal.publish(InvitationFacts.Revoked, {
              workspaceId,
              invitationId: invitation.details.id,
              _tag: "Revoked",
              revokedBy: actor.memberId,
              revokedAt,
            });
        }).pipe(Publication.withCause(removed, revokedAt));
      }
      return Object.assign({}, member, { status: "removed" as const }) satisfies Member.Member;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report,
  );

  const rename = Effect.fn("MemberService.rename")(
    function* (input: Member.Name) {
      const name = yield* Schema.decodeEffect(Member.NewName)(input);
      yield* authorization.require([]);
      const member = yield* requireMember((yield* Actor.Actor).memberId);
      if (member.name === name) return member;
      yield* journal.publish(MemberFacts.Renamed, { workspaceId, memberId: member.id, name });
      return Object.assign({}, member, { name }) satisfies Member.Member;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report,
  );

  return MemberService.of({ get, list, remove, rename });
});

/**
 * Provide member operations over the caller's workspace services.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(MemberService, make());
