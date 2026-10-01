import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../../authorization/authorization.ts";
import { Requirement } from "../../authorization/requirement.ts";
import { AgentPermissions } from "../../agent/permissions.ts";
import { Actor } from "../../identity/actor.ts";
import { Journal } from "../../journal/journal.ts";
import { Publication } from "../../journal/publication.ts";
import { Store } from "../../journal/store.ts";
import { ThreadCommand } from "../command.ts";
import { ThreadQuery } from "../query.ts";
import { ThreadParticipation } from "../participation/participation.ts";
import { ThreadMessage } from "./message.ts";
import { ThreadMessagePermissions } from "./permissions.ts";
import { ThreadReading } from "../../attention/reading.ts";
import { Request } from "../../request/request.ts";
import { ThreadMessageStore } from "./store.ts";
import { HumanAuthorRequired, NotFound, ParticipantUnavailable } from "./errors.ts";
import { Notification } from "../../notification/notification.ts";
export { HumanAuthorRequired, NotFound, ParticipantUnavailable } from "./errors.ts";

export type Error =
  | ThreadReading.Error
  | Authorization.Error
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound>
  | Exclude<ThreadCommand.Error, ThreadCommand.Unavailable>
  | NotFound
  | ParticipantUnavailable
  | HumanAuthorRequired
  | ThreadMessageStore.Failure;
export interface Interface {
  /**
   * Publish a human reply; join its author and eligible mentions, recording recipients atomically.
   * Mentioned agents need the author's agent-use authority; agents already taking part do not.
   */
  readonly publish: (
    input: ThreadMessage.PublishInput,
    options?: Request.Options,
  ) => Effect.Effect<ThreadMessage.Record, Error, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/message/application/Service",
) {}
export const make = Effect.fn("ThreadMessageApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const threadQuery = yield* ThreadQuery.Service;
  const threadCommand = yield* ThreadCommand.Service;
  const threadReading = yield* ThreadReading.Service;
  const threadMessageStore = yield* ThreadMessageStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;
  /**
   * The ID a reply gives its message. Without a key it is new each time. A keyed reply derives it
   * from its author and key, so a retry names the message its first attempt published.
   */
  const deriveReplyId = Effect.fnUntraced(function* (key: Request.Key | undefined) {
    const actor = yield* Actor.Service;
    return ThreadMessage.Id.make(
      yield* Request.idFor(key, ["thread.reply", workspaceId, actor.memberId]),
    );
  });
  /** The message an earlier attempt of this keyed reply published, so a retry returns it. */
  const findRetriedReply = (key: Request.Key | undefined, messageId: ThreadMessage.Id) =>
    key === undefined ? Effect.succeedNone : threadMessageStore.get(messageId);
  const publish = Effect.fn("ThreadMessageApplication.publish")(
    function* (input: ThreadMessage.PublishInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(ThreadMessage.PublishInput)(input);
      const thread = yield* threadQuery
        .requireAccess(request.threadId)
        .pipe(
          Effect.catchTag("ThreadQuery.NotFound", (error) =>
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
      const messageId = yield* deriveReplyId(options.requestKey);
      const retried = yield* findRetriedReply(options.requestKey, messageId);
      if (Option.isSome(retried)) return retried.value;
      // Without mentions a reply addresses every current participant, including contacts and
      // triage; with them, only the author and those mentioned are read.
      const current =
        request.mentions.length === 0 ? yield* threadQuery.currentParticipants(thread) : [];
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
      const eligible = yield* threadQuery.eligibleMembers(thread.groupId, joining);
      for (const reference of selected) {
        if (reference._tag !== "Member" || participating.has(reference.memberId)) continue;
        const entry = eligible.get(reference.memberId);
        if (entry === undefined)
          return yield* new ParticipantUnavailable({ memberId: reference.memberId });
        // Mentioning an agent directs it; replying where it already takes part does not.
        if (entry.member.identity._tag === "Agent" && request.mentions.includes(reference.memberId))
          yield* authorization.require([
            Requirement.make(AgentPermissions.Use, {
              _tag: "Member",
              workspaceId,
              memberId: reference.memberId,
            }),
          ]);
      }
      const published = yield* threadCommand
        .publishMessage({
          ...request,
          messageId,
          author: { _tag: "Member", memberId: actor.memberId },
          participants: selected,
          occurredAt: yield* DateTime.now,
        })
        .pipe(
          Effect.catchTag("ThreadCommand.Unavailable", (error) =>
            Effect.fail(new ParticipantUnavailable({ memberId: error.memberId })),
          ),
        );
      // Replying reads the thread through the author's own message.
      yield* threadReading.markRead(
        Notification.ofMember(actor.memberId, actor.identity),
        thread,
        published.activity.sequence,
      );
      return published.message;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  return Service.of({ publish });
});
export const layer = Layer.effect(Service, make());
export * as ThreadMessageApplication from "./application.ts";
