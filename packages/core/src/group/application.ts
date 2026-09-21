import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Target } from "../authorization/target.ts";
import { Actor } from "../identity/actor.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { Group } from "./group.ts";
import { GroupFacts } from "./facts.ts";
import { GroupPermissions } from "./permissions.ts";
import { GroupMembership } from "./membership/membership.ts";
import { GroupMembershipFacts } from "./membership/facts.ts";

export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "GroupApplication.MemberNotFound",
  {
    memberId: Member.Id,
  },
) {}
export class InactiveMember extends Schema.TaggedError<InactiveMember>()(
  "GroupApplication.InactiveMember",
  {
    memberId: Member.Id,
  },
) {}
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "GroupApplication.InvalidResponse",
  {
    message: Schema.String,
  },
) {}

export type Error =
  | Authorization.Error
  | MemberStore.Failure
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error
  | MemberNotFound
  | InactiveMember
  | InvalidResponse;

export interface Interface {
  readonly workspaceId: Group.Record["workspaceId"];
  /**
   * Require group.create in this workspace, then create a private team and its explicit
   * initial admissions in one commit. No extra membership-management grant is required
   * for the initial audience. New invocations create new groups; this is not a retry receipt.
   */
  readonly createPrivateTeam: (
    input: Group.CreatePrivateTeamInput,
  ) => Effect.Effect<Group.Record, Error, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/group/application/Service",
) {}

/** Capture workspace dependencies; resolve authority and member eligibility inside each commit. @category constructors */
export const make = Effect.fn("GroupApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const members = yield* MemberStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  if (members.workspaceId !== workspaceId)
    return yield* new InvalidResponse({ message: "Group services belong to different workspaces" });
  const create = Requirement.make(
    GroupPermissions.Create,
    Target.Reference.cases.Workspace.make({ workspaceId }),
  );

  const createPrivateTeam = Effect.fn("GroupApplication.createPrivateTeam")(
    function* (input: Group.CreatePrivateTeamInput) {
      yield* authorization.require([create]);
      const request = yield* Schema.decodeEffect(Schema.toType(Group.CreatePrivateTeamInput))(
        input,
      );
      for (const memberId of request.memberIds) {
        const found = yield* members.get(memberId);
        if (Option.isNone(found)) return yield* new MemberNotFound({ memberId });
        const member = yield* Schema.decodeEffect(Member.Record)(found.value);
        if (member.workspaceId !== workspaceId || member.id !== memberId)
          return yield* new InvalidResponse({
            message: "Member store returned another member or workspace",
          });
        if (member.status !== "active") return yield* new InactiveMember({ memberId });
      }
      const actor = yield* Actor.Service;
      const createdAt = yield* DateTime.now;
      const group: Group.Record = {
        id: Group.Id.make(yield* crypto.randomUUIDv4),
        workspaceId,
        kind: "Team",
        visibility: "Private",
        name: request.name,
        createdBy: actor.memberId,
        createdAt,
      };
      const created = yield* journal
        .publish(GroupFacts.Created, group)
        .pipe(Publication.withOccurredAt(createdAt));
      for (const memberId of request.memberIds) {
        yield* journal
          .publish(GroupMembershipFacts.Added, {
            id: GroupMembership.Id.make(yield* crypto.randomUUIDv4),
            workspaceId,
            groupId: group.id,
            memberId,
            admittedAt: createdAt,
            status: "active",
          })
          .pipe(Publication.withCause(created, createdAt));
      }
      return group;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  return Service.of({ workspaceId, createPrivateTeam });
});

/** Provide private team creation over the workspace's journal and authorization. @category layers */
export const layer = Layer.effect(Service, make());

export * as GroupApplication from "./application.ts";
