import * as Identity from "../identity/Identity.ts";
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import * as Authorization from "../authorization/Authorization.ts";
import * as Delegation from "../authorization/Delegation.ts";
import * as Requirement from "../authorization/Requirement.ts";
import * as Target from "../authorization/Target.ts";
import * as Actor from "../identity/Actor.ts";

import * as GroupCommand from "../group/GroupCommand.ts";
import * as GroupMembershipStore from "../group/GroupMembershipStore.ts";
import * as Journal from "../journal/Journal.ts";
import * as Publication from "../journal/Publication.ts";
import type * as Log from "../journal/Log.ts";
import type * as Projection from "../journal/Projection.ts";
import * as Store from "../journal/Store.ts";

import * as InvitationFacts from "./InvitationFacts.ts";
import * as InvitationStore from "./InvitationStore.ts";
import * as MemberFacts from "./MemberFacts.ts";
import * as MemberPermissions from "./MemberPermissions.ts";
import * as MemberStore from "./MemberStore.ts";
import * as Member from "./Member.ts";
import * as WorkspaceStore from "./WorkspaceStore.ts";

import { AlreadyRemoved, NotFound, OwnerProtected } from "./MemberErrors.ts";
export { AlreadyRemoved, NotFound, OwnerProtected } from "./MemberErrors.ts";

export type Error = Authorization.Error | MemberStore.Failure | Schema.SchemaError | NotFound;

export type RenameError = Error | Projection.Error | Log.WriteError | PlatformError.PlatformError;
export type RemoveError =
  | GroupCommand.RemoveError
  | Error
  | PlatformError.PlatformError
  | Delegation.Error
  | WorkspaceStore.Failure
  | InvitationStore.Failure
  | GroupMembershipStore.Failure
  | Projection.Error
  | Log.WriteError
  | OwnerProtected
  | AlreadyRemoved;

export class MemberService extends Context.Service<
  MemberService,
  {
    /**
     * Read an active or removed membership after requiring member.read on it.
     * Authorization and lookup read current state without opening a transaction.
     * They use an existing commit when present. Only authorized callers can receive NotFound.
     */
    readonly get: (memberId: Member.Id) => Effect.Effect<Member.Record, Error, Actor.Actor>;
    /**
     * List the memberships the actor may read, active and removed. Active
     * membership is required; each record is then included only when member.read
     * covers it, so a workspace-scoped grant sees everyone and an exact grant sees
     * that member. This does not open a transaction or promise a shared snapshot.
     */
    readonly list: Effect.Effect<ReadonlyArray<Member.Record>, Error, Actor.Actor>;
    /**
     * Require member.remove on an active target, protect current ownership, and
     * publish its removal and revoke its human recipient's pending invitations in
     * one commit, ending all of its active group admissions. Historical membership and grants remain;
     * authorization rejects removed members. Rejoining requires a new member ID.
     */
    readonly remove: (
      memberId: Member.Id,
    ) => Effect.Effect<Member.Record, RemoveError, Actor.Actor>;
    /**
     * Choose what people in the workspace call the acting member. Anyone active may name
     * themselves, and only themselves; the same name again records nothing.
     */
    readonly rename: (name: Member.Name) => Effect.Effect<Member.Record, RenameError, Actor.Actor>;
  }
>()("@amends-dev/core/workspace/member-application/Service") {}

const decodeId = Schema.decodeEffect(Member.Id);

/**
 * Construct member operations from workspace services; the caller supplies Actor.Actor per call.
 *
 * @category constructors
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
    if (Option.isNone(found)) return yield* new NotFound({ workspaceId, memberId: id });
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
  });

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
  }).pipe(Effect.withSpan("MemberService.list"));

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
        return yield* new OwnerProtected({ workspaceId, memberId: id });
      if (member.status === "removed")
        return yield* new AlreadyRemoved({ workspaceId, memberId: id });
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
      return Object.assign({}, member, { status: "removed" as const }) satisfies Member.Record;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const rename = Effect.fn("MemberService.rename")(
    function* (input: Member.Name) {
      const name = yield* Schema.decodeEffect(Member.NewName)(input);
      yield* authorization.require([]);
      const member = yield* requireMember((yield* Actor.Actor).memberId);
      if (member.name === name) return member;
      yield* journal.publish(MemberFacts.Renamed, { workspaceId, memberId: member.id, name });
      return Object.assign({}, member, { name }) satisfies Member.Record;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  return MemberService.of({ get, list, remove, rename });
});

/**
 * Provide member operations over the caller's workspace services.
 *
 * @category layers
 */
export const layer = Layer.effect(MemberService, make());
