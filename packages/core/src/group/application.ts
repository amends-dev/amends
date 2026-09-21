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
import { GroupAudience } from "./audience.ts";
import { GroupStore } from "./store.ts";
import { GroupFacts } from "./facts.ts";
import { GroupPermissions } from "./permissions.ts";
import { GroupMembership } from "./membership/membership.ts";
import { GroupMembershipFacts } from "./membership/facts.ts";
import { GroupMembershipPermissions } from "./membership/permissions.ts";
import { GroupMembershipStore } from "./membership/store.ts";

/** Missing groups and groups outside the caller's audience share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("GroupApplication.NotFound", {
  groupId: Group.Id,
}) {}

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

export type ReadError =
  | Authorization.Error
  | GroupStore.Failure
  | GroupMembershipStore.Failure
  | Schema.SchemaError
  | GroupAudience.InvalidResponse
  | NotFound
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
  /** Require group.read and current audience membership; no transaction or publication. */
  readonly get: (groupId: Group.Id) => Effect.Effect<Group.Record, ReadError, Actor.Service>;
  /** Current readable groups only, ordered by group ID. Honors an existing transaction. */
  readonly listMine: Effect.Effect<ReadonlyArray<Group.Record>, ReadError, Actor.Service>;
  /** Inspect a known group's metadata with management authority, without granting audience access. */
  readonly getForManagement: (
    groupId: Group.Id,
  ) => Effect.Effect<Group.Record, ReadError, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/group/application/Service",
) {}

/** Capture workspace dependencies; resolve authority and member eligibility inside each commit. @category constructors */
export const make = Effect.fn("GroupApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const members = yield* MemberStore.Service;
  const groups = yield* GroupStore.Service;
  const memberships = yield* GroupMembershipStore.Service;
  const audience = yield* GroupAudience.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  if (
    [members.workspaceId, groups.workspaceId, memberships.workspaceId, audience.workspaceId].some(
      (id) => id !== workspaceId,
    )
  )
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
  const load = Effect.fnUntraced(function* (groupId: Group.Id) {
    const found = yield* groups.get(groupId);
    if (Option.isNone(found)) return yield* new NotFound({ groupId });
    const group = yield* Schema.decodeEffect(Schema.toType(Group.Record))(found.value).pipe(
      Effect.mapError(
        (cause) =>
          new InvalidResponse({ message: `Group store returned invalid data: ${cause.message}` }),
      ),
    );
    if (group.workspaceId !== workspaceId || group.id !== groupId)
      return yield* new InvalidResponse({
        message: "Group store returned another group or workspace",
      });
    return group;
  });
  const get = Effect.fn("GroupApplication.get")(function* (groupId: Group.Id) {
    const id = yield* Schema.decodeEffect(Group.Id)(groupId);
    yield* audience
      .require(id)
      .pipe(
        Effect.catchTag("GroupAudience.NotMember", () =>
          Effect.fail(new NotFound({ groupId: id })),
        ),
      );
    yield* authorization.require([
      Requirement.make(GroupPermissions.Read, { _tag: "Group", workspaceId, groupId: id }),
    ]);
    return yield* load(id);
  });
  const getForManagement = Effect.fn("GroupApplication.getForManagement")(function* (
    groupId: Group.Id,
  ) {
    const id = yield* Schema.decodeEffect(Group.Id)(groupId);
    yield* authorization.require([
      Requirement.make(GroupMembershipPermissions.Manage, {
        _tag: "Group",
        workspaceId,
        groupId: id,
      }),
    ]);
    return yield* load(id);
  });
  const listMine = Effect.gen(function* () {
    yield* authorization.require([]);
    const actor = yield* Actor.Service;
    const seen = new Set<Group.Id>();
    const seenAdmissions = new Set<GroupMembership.Id>();
    const readable: Array<Group.Record> = [];
    for (const found of yield* memberships.listActiveByMember(actor.memberId)) {
      const membership = yield* Schema.decodeEffect(Schema.toType(GroupMembership.Record))(
        found,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new InvalidResponse({
              message: `Membership store returned invalid data: ${cause.message}`,
            }),
        ),
      );
      if (
        membership.workspaceId !== workspaceId ||
        membership.memberId !== actor.memberId ||
        membership.status !== "active" ||
        seen.has(membership.groupId) ||
        seenAdmissions.has(membership.id)
      )
        return yield* new InvalidResponse({
          message: "Membership store returned an inconsistent active admission listing",
        });
      seen.add(membership.groupId);
      seenAdmissions.add(membership.id);
      const group = yield* get(membership.groupId).pipe(
        Effect.asSome,
        Effect.catchTag(
          ["GroupApplication.NotFound", "Authorization.Denied"],
          () => Effect.succeedNone,
        ),
      );
      if (Option.isSome(group)) readable.push(group.value);
    }
    return readable.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  }).pipe(Effect.withSpan("GroupApplication.listMine"));

  return Service.of({ workspaceId, createPrivateTeam, get, listMine, getForManagement });
});

/** Provide group creation and authorized reads over the workspace's services. @category layers */
export const layer = Layer.effect(Service, make());

export * as GroupApplication from "./application.ts";
