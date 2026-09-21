import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Authorization } from "../../authorization/authorization.ts";
import { Requirement } from "../../authorization/requirement.ts";
import { Target } from "../../authorization/target.ts";
import type { Actor } from "../../identity/actor.ts";
import { Journal } from "../../journal/journal.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { Publication } from "../../journal/publication.ts";
import { WorkspaceId } from "../../workspace/id.ts";
import { Member } from "../../workspace/member/member.ts";
import { MemberStore } from "../../workspace/member/store.ts";
import { Group } from "../group.ts";
import { GroupStore } from "../store.ts";
import { GroupMembership } from "./membership.ts";
import { GroupMembershipFacts } from "./facts.ts";
import { GroupMembershipPermissions } from "./permissions.ts";
import { GroupMembershipStore } from "./store.ts";

export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "GroupMembershipApplication.GroupNotFound",
  { groupId: Group.Id },
) {}
export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "GroupMembershipApplication.MemberNotFound",
  { memberId: Member.Id },
) {}
export class InactiveMember extends Schema.TaggedError<InactiveMember>()(
  "GroupMembershipApplication.InactiveMember",
  { memberId: Member.Id },
) {}
export class AlreadyMember extends Schema.TaggedError<AlreadyMember>()(
  "GroupMembershipApplication.AlreadyMember",
  { groupId: Group.Id, memberId: Member.Id },
) {}
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "GroupMembershipApplication.InvalidResponse",
  { message: Schema.String },
) {}

export type Error =
  | Authorization.Error
  | GroupStore.Failure
  | MemberStore.Failure
  | GroupMembershipStore.Failure
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error
  | GroupNotFound
  | MemberNotFound
  | InactiveMember
  | AlreadyMember
  | InvalidResponse;

export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  /**
   * Require group.membership.manage on this group, validate its active workspace member,
   * and publish a fresh admission in one commit. An active admission is rejected without
   * another fact. Management authority does not require the caller to belong to the group.
   */
  readonly add: (
    input: GroupMembership.AddInput,
  ) => Effect.Effect<GroupMembership.Record, Error, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/group/membership/application/Service",
) {}

const invalidRecord = (cause: Schema.SchemaError) =>
  new InvalidResponse({ message: `Membership storage returned invalid data: ${cause.message}` });
const decodeInput = Schema.decodeEffect(GroupMembership.AddInput);
const decodeGroup = Schema.decodeEffect(Schema.toType(Group.Record));
const decodeMember = Schema.decodeEffect(Member.Record);
const decodeMembership = Schema.decodeEffect(Schema.toType(GroupMembership.Record));

/** Capture workspace dependencies; resolve authority and transaction state per operation. @category constructors */
export const make = Effect.fn("GroupMembershipApplication.make")(function* (): Effect.fn.Return<
  Interface,
  InvalidResponse,
  | Authorization.Service
  | GroupStore.Service
  | MemberStore.Service
  | GroupMembershipStore.Service
  | Journal.Service
  | Crypto.Crypto
> {
  const authorization = yield* Authorization.Service;
  const groups = yield* GroupStore.Service;
  const members = yield* MemberStore.Service;
  const memberships = yield* GroupMembershipStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  if (
    [groups.workspaceId, members.workspaceId, memberships.workspaceId].some(
      (id) => id !== workspaceId,
    )
  )
    return yield* new InvalidResponse({
      message: "Group membership services belong to different workspaces",
    });

  const add = Effect.fn("GroupMembershipApplication.add")(
    function* (input: GroupMembership.AddInput) {
      const { groupId, memberId } = yield* decodeInput(input);
      yield* authorization.require([
        Requirement.make(
          GroupMembershipPermissions.Manage,
          Target.Reference.cases.Group.make({ workspaceId, groupId }),
        ),
      ]);
      const foundGroup = yield* groups.get(groupId);
      if (Option.isNone(foundGroup)) return yield* new GroupNotFound({ groupId });
      const group = yield* decodeGroup(foundGroup.value).pipe(Effect.mapError(invalidRecord));
      if (group.workspaceId !== workspaceId || group.id !== groupId)
        return yield* new InvalidResponse({
          message: "Group store returned another group or workspace",
        });

      const foundMember = yield* members.get(memberId);
      if (Option.isNone(foundMember)) return yield* new MemberNotFound({ memberId });
      const member = yield* decodeMember(foundMember.value).pipe(Effect.mapError(invalidRecord));
      if (member.workspaceId !== workspaceId || member.id !== memberId)
        return yield* new InvalidResponse({
          message: "Member store returned another member or workspace",
        });
      if (member.status !== "active") return yield* new InactiveMember({ memberId });

      const foundMembership = yield* memberships.findActive(groupId, memberId);
      if (Option.isSome(foundMembership)) {
        const membership = yield* decodeMembership(foundMembership.value).pipe(
          Effect.mapError(invalidRecord),
        );
        if (
          membership.workspaceId !== workspaceId ||
          membership.groupId !== groupId ||
          membership.memberId !== memberId ||
          membership.status !== "active"
        )
          return yield* new InvalidResponse({
            message: "Membership store returned another group, member, workspace, or state",
          });
        return yield* new AlreadyMember({ groupId, memberId });
      }

      const admittedAt = yield* DateTime.now;
      const membership = {
        id: GroupMembership.Id.make(yield* crypto.randomUUIDv4),
        workspaceId,
        groupId,
        memberId,
        admittedAt,
        status: "active",
      } satisfies GroupMembership.Record;
      yield* journal
        .publish(GroupMembershipFacts.Added, membership)
        .pipe(Publication.withOccurredAt(admittedAt));
      return membership;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  return Service.of({ workspaceId, add });
});

/** Provide membership operations over the workspace's existing stores and journal. @category layers */
export const layer = Layer.effect(Service, make());

export * as GroupMembershipApplication from "./application.ts";
