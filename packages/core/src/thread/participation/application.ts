import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../../authorization/authorization.ts";
import { Requirement } from "../../authorization/requirement.ts";
import { Actor } from "../../identity/actor.ts";
import { Identity } from "../../identity/identity.ts";
import { Journal } from "../../journal/journal.ts";
import { Publication } from "../../journal/publication.ts";
import { Thread } from "../thread.ts";
import { ThreadAccess } from "../access.ts";
import { ThreadActivityPublisher } from "../activity/publisher.ts";
import { ThreadParticipationActivity } from "./activity.ts";
import { ThreadParticipation } from "./participation.ts";
import { ThreadParticipationStore } from "./store.ts";
import { ThreadParticipationAdmission } from "./admission.ts";
import { ThreadParticipationDeparture } from "./departure.ts";
import { ThreadParticipationPermissions } from "./permissions.ts";
import { GroupStore } from "../../group/store.ts";
import { AlreadyEnded, FixedParticipation, NotFound, ThreadNotFound } from "./errors.ts";
export { AlreadyEnded, FixedParticipation, NotFound, ThreadNotFound } from "./errors.ts";

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "ThreadParticipationApplication.InvalidResponse",
  { message: Schema.String },
) {}
export type Error =
  | Authorization.Error
  | Exclude<ThreadAccess.Error, ThreadAccess.NotFound>
  | ThreadParticipationAdmission.Error
  | ThreadActivityPublisher.Error
  | ThreadParticipationDeparture.Error
  | GroupStore.Failure
  | ThreadNotFound
  | NotFound
  | AlreadyEnded
  | FixedParticipation
  | InvalidResponse;
export interface Interface {
  readonly workspaceId: Thread.Record["workspaceId"];
  /** Follow as the acting member. An existing participation is returned without new facts. */
  readonly follow: (
    threadId: Thread.Id,
  ) => Effect.Effect<ThreadParticipation.Summary, Error, Actor.Service>;
  /**
   * End only the actor's addressed participation, with no action grant required. Threads of a
   * direct conversation, where everyone takes part in everything, cannot be unfollowed.
   */
  readonly unfollow: (
    input: ThreadParticipation.UnfollowInput,
  ) => Effect.Effect<void, Error, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/participation/application/Service",
) {}
const sameIdentity = Schema.toEquivalence(Identity.MemberReference);
const invalidRecord = (cause: Schema.SchemaError) =>
  new InvalidResponse({ message: `Invalid participation data: ${cause.message}` });
export const make = Effect.fn("ThreadParticipationApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const access = yield* ThreadAccess.Service;
  const admissions = yield* ThreadParticipationAdmission.Service;
  const participations = yield* ThreadParticipationStore.Service;
  const publisher = yield* ThreadActivityPublisher.Service;
  const departures = yield* ThreadParticipationDeparture.Service;
  const groups = yield* GroupStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  if (
    [
      access.workspaceId,
      admissions.workspaceId,
      participations.workspaceId,
      publisher.workspaceId,
      departures.workspaceId,
      groups.workspaceId,
    ].some((id) => id !== workspaceId)
  )
    return yield* new InvalidResponse({
      message: "Participation services belong to different workspaces",
    });
  const requireAccess = (threadId: Thread.Id) =>
    access
      .require(threadId)
      .pipe(
        Effect.catchTag("ThreadAccess.NotFound", (error) =>
          Effect.fail(new ThreadNotFound({ threadId: error.threadId })),
        ),
      );
  const follow = Effect.fn("ThreadParticipationApplication.follow")(
    function* (threadId: Thread.Id) {
      const thread = yield* requireAccess(threadId);
      yield* authorization.require([
        Requirement.make(ThreadParticipationPermissions.Follow, {
          _tag: "Thread",
          workspaceId,
          threadId: thread.id,
        }),
      ]);
      const actor = yield* Actor.Service;
      const [current] = yield* admissions.find(thread, [
        { _tag: "Member", memberId: actor.memberId },
      ]);
      if (current !== undefined) return ThreadParticipation.toSummary(current);
      const followed = yield* publisher.publish({
        thread,
        occurredAt: yield* DateTime.now,
        admit: [{ _tag: "Member", memberId: actor.memberId }],
        step: ({ sequence, admitted }) => {
          const participant = admitted.participants[0];
          const added = admitted.added[0];
          if (
            admitted.participants.length !== 1 ||
            admitted.added.length !== 1 ||
            added === undefined ||
            participant === undefined ||
            participant.participant._tag !== "Member" ||
            participant.participant.memberId !== actor.memberId ||
            participant.threadId !== thread.id ||
            participant.workspaceId !== workspaceId ||
            participant.joinedAtSequence !== sequence ||
            !sameIdentity(participant.participant.identity, actor.identity)
          )
            return Effect.fail(
              new InvalidResponse({ message: "Admission returned another participation" }),
            );
          return Effect.succeed({
            value: participant,
            kind: ThreadParticipationActivity.Followed,
            details: { participationId: participant.id },
            recipients: [],
            cause: added,
          });
        },
      });
      return ThreadParticipation.toSummary(followed.value);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  const unfollow = Effect.fn("ThreadParticipationApplication.unfollow")(
    function* (input: ThreadParticipation.UnfollowInput) {
      const request = yield* Schema.decodeEffect(ThreadParticipation.UnfollowInput)(input);
      const thread = yield* requireAccess(request.threadId);
      const group = yield* groups.get(thread.groupId);
      if (Option.isNone(group))
        return yield* new InvalidResponse({ message: "Thread group is missing" });
      if (group.value.kind === "Direct")
        return yield* new FixedParticipation({ threadId: thread.id });
      const actor = yield* Actor.Service;
      const found = yield* participations.get(request.participationId);
      if (Option.isNone(found)) return yield* new NotFound(request);
      const participant = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.Record))(
        found.value,
      ).pipe(Effect.mapError(invalidRecord));
      if (participant.id !== request.participationId || participant.workspaceId !== workspaceId)
        return yield* new InvalidResponse({
          message: "Participation store returned another record or workspace",
        });
      const own = participant.participant;
      if (
        participant.threadId !== thread.id ||
        own._tag !== "Member" ||
        own.memberId !== actor.memberId
      )
        return yield* new NotFound(request);
      if (!sameIdentity(own.identity, actor.identity))
        return yield* new InvalidResponse({ message: "Participation has another identity" });
      if (participant.status === "ended") return yield* new AlreadyEnded(request);
      const current = (yield* admissions.find(thread, [ThreadParticipation.referenceOf(own)])).find(
        (p) => p.id === participant.id,
      );
      if (current === undefined)
        return yield* new InvalidResponse({
          message: "Participation no longer has a current group admission",
        });
      yield* departures.end({ ...request, workspaceId }, yield* DateTime.now);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  return Service.of({ workspaceId, follow, unfollow });
});
export const layer = Layer.effect(Service, make());
export * as ThreadParticipationApplication from "./application.ts";
