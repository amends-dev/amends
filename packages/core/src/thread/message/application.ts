import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../../authorization/authorization.ts";
import { Requirement } from "../../authorization/requirement.ts";
import { AgentPermissions } from "../../agent/permissions.ts";
import { Actor } from "../../identity/actor.ts";
import { Journal } from "../../journal/journal.ts";
import { Publication } from "../../journal/publication.ts";
import { ThreadAccess } from "../access.ts";
import { ThreadParticipationAdmission } from "../participation/admission.ts";
import { ThreadParticipation } from "../participation/participation.ts";
import { ThreadMessage } from "./message.ts";
import { ThreadMessagePermissions } from "./permissions.ts";
import { ThreadMessagePublication } from "./publication.ts";
import { ThreadReading } from "../../attention/reading.ts";
import type { Request } from "../../request/request.ts";
import { RequestReceipts } from "../../request/receipts.ts";
import { ThreadActivityStore } from "../activity/store.ts";
import { ThreadMessageReceipt } from "./receipt.ts";
import { ThreadMessageStore } from "./store.ts";
import { HumanAuthorRequired, NotFound, ParticipantUnavailable } from "./errors.ts";
import { Notification } from "../../notification/notification.ts";
export { HumanAuthorRequired, NotFound, ParticipantUnavailable } from "./errors.ts";

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "ThreadMessageApplication.InvalidResponse",
  {
    message: Schema.String,
  },
) {}
export type Error =
  | ThreadReading.Error
  | Authorization.Error
  | Exclude<ThreadAccess.Error, ThreadAccess.NotFound>
  | Exclude<ThreadMessagePublication.Error, ThreadParticipationAdmission.Unavailable>
  | NotFound
  | ParticipantUnavailable
  | HumanAuthorRequired
  | RequestReceipts.Error
  | ThreadMessageStore.Failure
  | ThreadActivityStore.Failure
  | InvalidResponse;
export interface Interface {
  readonly workspaceId: ThreadMessage.Record["workspaceId"];
  /**
   * Publish a human reply; join its author and eligible mentions, recording recipients atomically.
   * Mentioned agents need the author's agent-use authority; agents already taking part do not.
   */
  readonly publish: (
    input: ThreadMessage.PublishInput,
    options?: Request.Options,
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
  const readings = yield* ThreadReading.Service;
  const receipts = yield* RequestReceipts.Service;
  const messages = yield* ThreadMessageStore.Service;
  const activities = yield* ThreadActivityStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  if (
    [
      access.workspaceId,
      admissions.workspaceId,
      publication.workspaceId,
      readings.workspaceId,
      receipts.workspaceId,
      messages.workspaceId,
      activities.workspaceId,
    ].some((id) => id !== workspaceId)
  )
    return yield* new InvalidResponse({
      message: "Message services belong to different workspaces",
    });
  const publish = Effect.fn("ThreadMessageApplication.publish")(
    function* (input: ThreadMessage.PublishInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(ThreadMessage.PublishInput)(input);
      return yield* receipts.once(
        {
          operation: "thread.reply",
          key: options.requestKey,
          input: ThreadMessage.PublishInput,
          value: request,
          result: ThreadMessageReceipt.Published,
          resultOf: ThreadMessageReceipt.publishedOf,
          restore: (reference: ThreadMessageReceipt.Published) =>
            ThreadMessageReceipt.restorePublished({ messages, activities }, reference).pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () =>
                    Effect.fail(
                      new InvalidResponse({ message: "A request's published message is missing" }),
                    ),
                  onSome: Effect.succeed,
                }),
              ),
            ),
        },
        Effect.gen(function* () {
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
          // Without mentions a reply addresses every current participant, including contacts and
          // triage; with them, only the author and those mentioned are read.
          const current = request.mentions.length === 0 ? yield* admissions.current(thread) : [];
          const author: ThreadParticipation.Reference = {
            _tag: "Member",
            memberId: actor.memberId,
          };
          const addressed: ReadonlyArray<ThreadParticipation.Reference> =
            request.mentions.length === 0
              ? current.map((p) => ThreadParticipation.referenceOf(p.participant))
              : request.mentions.map((memberId) => ({ _tag: "Member" as const, memberId }));
          const selected = [
            ...new Map(
              [author, ...addressed].map((reference) => [
                ThreadParticipation.keyOf(reference),
                reference,
              ]),
            ).values(),
          ];
          // Current participants already hold a current admission; only the others need checking.
          const participating = new Set(
            current.flatMap((p) => ThreadParticipation.memberOf(p.participant) ?? []),
          );
          const joining = selected.flatMap((reference) =>
            reference._tag === "Member" && !participating.has(reference.memberId)
              ? [reference.memberId]
              : [],
          );
          const eligible = yield* admissions.eligible(thread.groupId, joining);
          for (const reference of selected) {
            if (reference._tag !== "Member" || participating.has(reference.memberId)) continue;
            const entry = eligible.get(reference.memberId);
            if (entry === undefined)
              return yield* new ParticipantUnavailable({ memberId: reference.memberId });
            // Mentioning an agent directs it; replying where it already takes part does not.
            if (
              entry.member.identity._tag === "Agent" &&
              request.mentions.includes(reference.memberId)
            )
              yield* authorization.require([
                Requirement.make(AgentPermissions.Use, {
                  _tag: "Member",
                  workspaceId,
                  memberId: reference.memberId,
                }),
              ]);
          }
          const published = yield* publication
            .publish({
              ...request,
              author: { _tag: "Member", memberId: actor.memberId },
              participants: selected,
              occurredAt: yield* DateTime.now,
            })
            .pipe(
              Effect.catchTag("ThreadParticipationAdmission.Unavailable", (error) =>
                Effect.fail(new ParticipantUnavailable({ memberId: error.memberId })),
              ),
            );
          // Replying reads the thread through the author's own message.
          yield* readings.markRead(
            Notification.ofMember(actor.memberId, actor.identity),
            thread,
            published.activity.sequence,
          );
          return published;
        }),
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
