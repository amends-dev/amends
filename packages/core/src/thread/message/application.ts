import { Context, Crypto, DateTime, Effect, Layer, Schema } from "effect";
import { Authorization } from "../../authorization/authorization.ts";
import { Requirement } from "../../authorization/requirement.ts";
import { AgentPermissions } from "../../agent/permissions.ts";
import { Actor } from "../../identity/actor.ts";
import { Member } from "../../workspace/member/member.ts";
import { Journal } from "../../journal/journal.ts";
import { Publication } from "../../journal/publication.ts";
import { ThreadId } from "../id.ts";
import { ThreadAccess } from "../access.ts";
import { ThreadParticipationAdmission } from "../participation/admission.ts";
import { ThreadParticipation } from "../participation/participation.ts";
import { ThreadMessage } from "./message.ts";
import { ThreadMessagePermissions } from "./permissions.ts";
import { ThreadMessagePublication } from "./publication.ts";

export class NotFound extends Schema.TaggedError<NotFound>()("ThreadMessageApplication.NotFound", {
  threadId: ThreadId.Id,
}) {}
export class ParticipantUnavailable extends Schema.TaggedError<ParticipantUnavailable>()(
  "ThreadMessageApplication.ParticipantUnavailable",
  {
    memberId: Member.Id,
  },
) {}
export class HumanAuthorRequired extends Schema.TaggedError<HumanAuthorRequired>()(
  "ThreadMessageApplication.HumanAuthorRequired",
  {
    memberId: Member.Id,
  },
) {}
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "ThreadMessageApplication.InvalidResponse",
  {
    message: Schema.String,
  },
) {}
export type Error =
  | Authorization.Error
  | Exclude<ThreadAccess.Error, ThreadAccess.NotFound>
  | Exclude<ThreadMessagePublication.Error, ThreadParticipationAdmission.Unavailable>
  | NotFound
  | ParticipantUnavailable
  | HumanAuthorRequired
  | InvalidResponse;
export interface Interface {
  readonly workspaceId: ThreadMessage.Record["workspaceId"];
  /** Publish a human reply; join its author and eligible mentions, recording recipients atomically. */
  readonly publish: (
    input: ThreadMessage.PublishInput,
  ) => Effect.Effect<ThreadMessage.Published, Error, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/message/application/Service",
) {}
export const make = Effect.fn("ThreadMessageApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const access = yield* ThreadAccess.Service;
  const admissions = yield* ThreadParticipationAdmission.Service;
  const publication = yield* ThreadMessagePublication.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  if (
    [access.workspaceId, admissions.workspaceId, publication.workspaceId].some(
      (id) => id !== workspaceId,
    )
  )
    return yield* new InvalidResponse({
      message: "Message services belong to different workspaces",
    });
  const publish = Effect.fn("ThreadMessageApplication.publish")(
    function* (input: ThreadMessage.PublishInput) {
      const request = yield* Schema.decodeEffect(ThreadMessage.PublishInput)(input);
      const thread = yield* access
        .require(request.threadId)
        .pipe(
          Effect.catchTag("ThreadAccess.NotFound", (error) =>
            Effect.fail(new NotFound({ threadId: error.threadId })),
          ),
        );
      yield* authorization.require([
        Requirement.make(ThreadMessagePermissions.Publish, {
          _tag: "Thread",
          workspaceId,
          threadId: thread.id,
        }),
      ]);
      const actor = yield* Actor.Service;
      if (actor.identity._tag !== "Human")
        return yield* new HumanAuthorRequired({ memberId: actor.memberId });
      const current = yield* admissions.current(thread);
      const selected = [
        ...new Set([
          actor.memberId,
          ...(request.mentions.length === 0
            ? current.flatMap((p) => {
                const memberId = ThreadParticipation.memberOf(p.participant);
                return memberId === undefined ? [] : [memberId];
              })
            : request.mentions),
        ]),
      ];
      const eligible = yield* admissions.eligible(thread.groupId);
      for (const memberId of selected) {
        const entry = eligible.get(memberId);
        if (entry === undefined) return yield* new ParticipantUnavailable({ memberId });
        if (entry.member.identity._tag === "Agent")
          yield* authorization.require([
            Requirement.make(AgentPermissions.Use, { _tag: "Member", workspaceId, memberId }),
          ]);
      }
      return yield* publication
        .publish({
          ...request,
          authorMemberId: actor.memberId,
          participantIds: selected,
          occurredAt: yield* DateTime.now,
        })
        .pipe(
          Effect.catchTag("ThreadParticipationAdmission.Unavailable", (error) =>
            Effect.fail(new ParticipantUnavailable({ memberId: error.memberId })),
          ),
        );
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  return Service.of({ workspaceId, publish });
});
export const layer = Layer.effect(Service, make());
export * as ThreadMessageApplication from "./application.ts";
