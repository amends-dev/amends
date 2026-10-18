/**
 * The operations on messages an actor calls: publishing a reply, and editing and deleting one. Only
 * people write through it; an
 * agent's replies come from its turns. A reply authorizes its author and the members it mentions,
 * admits them, and records its recipients, all in one commit, and an edit does the same for the
 * members it newly mentions.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as AgentPermissions from "../agent/AgentPermissions.ts"
import * as Authorization from "../authorization/Authorization.ts"
import * as Requirement from "../authorization/Requirement.ts"
import * as Target from "../authorization/Target.ts"
import * as CoreError from "../error/CoreError.ts"
import * as Actor from "../identity/Actor.ts"
import * as Identity from "../identity/Identity.ts"
import * as Journal from "../journal/Journal.ts"
import * as Publication from "../journal/Publication.ts"
import * as Operation from "../operation/Operation.ts"
import * as ReadStateFacts from "../read-state/ReadStateFacts.ts"
import type * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as ThreadCommand from "./ThreadCommand.ts"
import type * as ThreadId from "./ThreadId.ts"
import * as ThreadMessage from "./ThreadMessage.ts"
import * as ThreadMessageId from "./ThreadMessageId.ts"
import * as ThreadMessagePermissions from "./ThreadMessagePermissions.ts"
import * as ThreadMessageStore from "./ThreadMessageStore.ts"
import * as ThreadParticipation from "./ThreadParticipation.ts"
import * as ThreadQuery from "./ThreadQuery.ts"

/**
 * What publishing can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * What editing a message can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type EditError =
  | CoreError.NotFound
  | CoreError.Changed
  | CoreError.Denied
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * What deleting a message can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type DeleteError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * The message operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class ThreadMessageService extends Context.Service<
  ThreadMessageService,
  {
    /**
     * Publish a human reply; join its author and eligible mentions, recording recipients atomically.
     * Mentioned agents need the author's agent-use authority; agents already taking part do not.
     * Within a request, a retry returns the message its first attempt published.
     */
    readonly publish: (
      input: ThreadMessage.PublishInput
    ) => Effect.Effect<ThreadMessage.ThreadMessage, Error, Actor.Actor>
    /**
     * Replace the text and mentions of a message the actor wrote, at its next revision, under
     * `thread.publish` on its thread. The same text and mentions again record nothing; otherwise a
     * revision other than `expectedRevision` is `CoreError.Changed`, and nothing is recorded.
     * Members the edit newly mentions join and are told, under the rules of a reply; a deleted
     * message is `Deleted`. Returns the message as edited.
     */
    readonly edit: (
      input: ThreadMessage.EditInput
    ) => Effect.Effect<ThreadMessage.ThreadMessage, EditError, Actor.Actor>
    /**
     * Delete a message: its own author's under `thread.publish` on the thread, anyone's under
     * `thread.moderate` on the thread's group. Its text is gone, its place in the thread stays, and
     * no one is told; one already deleted records nothing. Returns the message as deleted.
     */
    readonly delete: (
      messageId: ThreadMessageId.ThreadMessageId
    ) => Effect.Effect<ThreadMessage.ThreadMessage, DeleteError, Actor.Actor>
  }
>()("@amends-dev/core/thread/ThreadMessageService") {}

/**
 * Whom a reply by `authorId` selects to take part: its author, and those it addresses: the
 * members it mentions, or, without mentions, every current participant, contacts and triage
 * included.
 */
const selectedFor = (
  authorId: MemberId.MemberId,
  mentions: ReadonlyArray<MemberId.MemberId>,
  current: ReadonlyArray<ThreadParticipation.ThreadParticipation>
): ReadonlyArray<ThreadParticipation.Reference> => {
  const author: ThreadParticipation.Reference = ThreadParticipation.Reference.cases.Member.make({ memberId: authorId })
  const addressed: ReadonlyArray<ThreadParticipation.Reference> =
    mentions.length === 0
      ? current.map(({ participant }) => ThreadParticipation.referenceOf(participant))
      : mentions.map((memberId) => ThreadParticipation.Reference.cases.Member.make({ memberId }))
  const byKey = new Map([author, ...addressed].map((reference) => [ThreadParticipation.keyOf(reference), reference]))
  return [...byKey.values()]
}

/**
 * Capture bound services; authorize each reply inside its commit.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const authorization = yield* Authorization.Authorization
  const threadQuery = yield* ThreadQuery.ThreadQuery
  const threadCommand = yield* ThreadCommand.ThreadCommand
  const threadMessageStore = yield* ThreadMessageStore.ThreadMessageStore
  const journal = yield* Journal.Journal
  const crypto = yield* Crypto.Crypto
  const workspaceId = yield* WorkspaceId.CurrentWorkspaceId
  /** The thread, once the actor may read it and publish there. */
  const requirePublishable = Effect.fnUntraced(function* (threadId: ThreadId.ThreadId) {
    const thread = yield* threadQuery.requireAccess(threadId)
    yield* authorization.require([
      Requirement.make(
        ThreadMessagePermissions.Publish,
        Target.Reference.cases.Thread.make({ workspaceId, threadId: thread.id })
      )
    ])
    return thread
  })

  /**
   * A message and its thread, once the actor may act in that thread; to anyone outside its group,
   * the message is missing, as a missing one is.
   */
  const requireMessage = Effect.fnUntraced(function* (messageId: ThreadMessageId.ThreadMessageId) {
    const found = yield* threadMessageStore.get(messageId)
    if (Option.isNone(found)) return yield* new CoreError.NotFound({ resource: "ThreadMessage", id: messageId })
    const thread = yield* threadQuery
      .requireAccess(found.value.threadId)
      .pipe(
        Effect.catchTag(
          "CoreError.NotFound",
          () => new CoreError.NotFound({ resource: "ThreadMessage", id: messageId })
        )
      )
    return { message: found.value, thread }
  })

  /** Whether the actor wrote the message; only a member writes through the service. */
  const wroteBy = (message: ThreadMessage.ThreadMessage, actor: Actor.Actor["Service"]) =>
    ThreadMessage.Author.isAnyOf(["Member"])(message.author) && message.author.memberId === actor.memberId

  /** Whether two sets of mentions name the same members. */
  const sameMentions = (left: ReadonlyArray<MemberId.MemberId>, right: ReadonlyArray<MemberId.MemberId>) =>
    left.length === right.length && left.every((memberId) => right.includes(memberId))
  const publish = Effect.fn("ThreadMessageService.publish")(
    function* (input: ThreadMessage.PublishInput) {
      const request = yield* Schema.decodeEffect(ThreadMessage.PublishInput)(input)
      const thread = yield* requirePublishable(request.threadId)
      const actor = yield* Actor.Actor
      if (!Identity.MemberReference.isAnyOf(["Human"])(actor.identity))
        return yield* new CoreError.Denied({ reason: new CoreError.HumanRequired() })
      // A retry returns the message its first attempt published.
      const messageId = yield* ThreadMessage.newId(thread.id)
      const retried = yield* threadMessageStore.get(messageId)
      if (Option.isSome(retried)) return retried.value
      // Without mentions a reply addresses every current participant; with them, only the
      // author and those mentioned are read.
      const current = request.mentions.length === 0 ? yield* threadQuery.currentParticipants(thread) : []
      const selected = selectedFor(actor.memberId, request.mentions, current)
      // Current participants already hold a current admission; only the others need checking.
      const participating = new Set(
        current.flatMap(({ participant }) => ThreadParticipation.memberOf(participant) ?? [])
      )
      const joining = selected.flatMap((reference) =>
        ThreadParticipation.Reference.isAnyOf(["Member"])(reference) && !participating.has(reference.memberId)
          ? [reference.memberId]
          : []
      )
      const eligible = yield* threadQuery.eligibleMembers(thread.groupId, joining)
      for (const reference of selected) {
        if (!ThreadParticipation.Reference.isAnyOf(["Member"])(reference) || participating.has(reference.memberId))
          continue
        const entry = eligible.get(reference.memberId)
        if (entry === undefined)
          return yield* new CoreError.Conflict({
            reason: new CoreError.ParticipantUnavailable({ memberId: reference.memberId })
          })
        // Mentioning an agent directs it; replying where it already takes part does not.
        if (
          Identity.MemberReference.isAnyOf(["Agent"])(entry.member.identity) &&
          request.mentions.includes(reference.memberId)
        )
          yield* authorization.require([
            Requirement.make(
              AgentPermissions.Use,
              Target.Reference.cases.Member.make({ workspaceId, memberId: reference.memberId })
            )
          ])
      }
      const published = yield* threadCommand.publishMessage({
        ...request,
        messageId,
        author: ThreadMessage.Author.cases.Member.make({ memberId: actor.memberId }),
        via: null,
        participants: selected,
        occurredAt: yield* DateTime.now
      })
      // Replying reads the thread through the author's own message.
      yield* journal
        .publish(ReadStateFacts.ThreadRead, {
          workspaceId,
          memberId: actor.memberId,
          threadId: thread.id,
          readThrough: published.activity.sequence
        })
        .pipe(Publication.withOccurredAt(published.activity.occurredAt))
      return published.message
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const edit = Effect.fn("ThreadMessageService.edit")(
    function* (input: ThreadMessage.EditInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(ThreadMessage.EditInput))(input)
      const { message, thread } = yield* requireMessage(request.messageId)
      const actor = yield* Actor.Actor
      if (!Identity.MemberReference.isAnyOf(["Human"])(actor.identity))
        return yield* new CoreError.Denied({ reason: new CoreError.HumanRequired() })
      if (!wroteBy(message, actor))
        return yield* new CoreError.Denied({
          reason: new CoreError.NotAuthor({ messageId: message.id })
        })
      yield* authorization.require([
        Requirement.make(
          ThreadMessagePermissions.Publish,
          Target.Reference.cases.Thread.make({ workspaceId, threadId: thread.id })
        )
      ])
      if (!ThreadMessage.Content.isAnyOf(["Text"])(message.content))
        return yield* new CoreError.Conflict({
          reason: new CoreError.Deleted({ messageId: message.id })
        })
      const content = message.content
      if (content.text === request.text && sameMentions(content.mentions, request.mentions)) return message
      if (content.revision !== request.expectedRevision)
        return yield* new CoreError.Changed({ resource: "ThreadMessage", id: message.id })
      // Those the edit newly mentions must be able to take part, as a reply's mentions must, and
      // newly mentioning an agent not yet taking part directs it, so needs the author's agent use.
      const joining = request.mentions.filter((memberId) => !content.mentions.includes(memberId))
      const participating = new Set(
        (yield* threadQuery.findParticipants(
          thread,
          joining.map((memberId) => ThreadParticipation.Reference.cases.Member.make({ memberId }))
        )).flatMap(({ participant }) => ThreadParticipation.memberOf(participant) ?? [])
      )
      const eligible = yield* threadQuery.eligibleMembers(thread.groupId, joining)
      for (const memberId of joining) {
        const entry = eligible.get(memberId)
        if (entry === undefined)
          return yield* new CoreError.Conflict({
            reason: new CoreError.ParticipantUnavailable({ memberId })
          })
        if (Identity.MemberReference.isAnyOf(["Agent"])(entry.member.identity) && !participating.has(memberId))
          yield* authorization.require([
            Requirement.make(AgentPermissions.Use, Target.Reference.cases.Member.make({ workspaceId, memberId }))
          ])
      }
      const edited = yield* threadCommand.editMessage({
        message,
        text: request.text,
        mentions: request.mentions,
        occurredAt: yield* DateTime.now
      })
      return edited.message
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const deleteMessage = Effect.fn("ThreadMessageService.delete")(
    function* (messageId: ThreadMessageId.ThreadMessageId) {
      const id = yield* Schema.decodeEffect(ThreadMessageId.ThreadMessageId)(messageId)
      const { message, thread } = yield* requireMessage(id)
      const actor = yield* Actor.Actor
      if (!Identity.MemberReference.isAnyOf(["Human"])(actor.identity))
        return yield* new CoreError.Denied({ reason: new CoreError.HumanRequired() })
      // The author deletes their own message as they published it; anyone else moderates the group.
      yield* authorization.require([
        wroteBy(message, actor)
          ? Requirement.make(
              ThreadMessagePermissions.Publish,
              Target.Reference.cases.Thread.make({ workspaceId, threadId: thread.id })
            )
          : Requirement.make(
              ThreadMessagePermissions.Moderate,
              Target.Reference.cases.Group.make({ workspaceId, groupId: thread.groupId })
            )
      ])
      if (ThreadMessage.Content.isAnyOf(["Deleted"])(message.content)) return message
      const deleted = yield* threadCommand
        .deleteMessage({ message, occurredAt: yield* DateTime.now })
        .pipe(Effect.catchTag("CoreError.Conflict", () => Effect.die("A deletion admits no participant")))
      return deleted.message
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  return ThreadMessageService.of({ publish, edit, delete: deleteMessage })
})

/**
 * Provide the message operations over the shared reads and writes, the stores, and authorization.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ThreadMessageService, make)
