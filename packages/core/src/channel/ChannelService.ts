/**
 * The operations on channels an actor calls: creating one over a connection that gives channels,
 * reading them, redirecting one to another group, removing one, and reading which external
 * conversation a thread came from. Each operation authorizes the actor itself, writes inside one
 * journal commit, and reads outside any. What a channel receives is taken in by `ChannelIntake`,
 * and its replies carried out by deliveries, neither of which an actor calls.
 *
 * @since 0.1.0
 */

import type { Connection as ConnectionContract } from "@amends-dev/connection"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Authorization from "../authorization/Authorization.ts"
import type * as Permission from "../authorization/Permission.ts"
import * as Requirement from "../authorization/Requirement.ts"
import * as Target from "../authorization/Target.ts"
import * as ConnectionPermissions from "../connection/ConnectionPermissions.ts"
import * as ConnectionStore from "../connection/ConnectionStore.ts"
import * as CoreError from "../error/CoreError.ts"
import type * as GroupId from "../group/GroupId.ts"
import * as GroupQuery from "../group/GroupQuery.ts"
import * as Actor from "../identity/Actor.ts"
import * as Journal from "../journal/Journal.ts"
import * as Publication from "../journal/Publication.ts"
import * as Store from "../journal/Store.ts"
import * as Operation from "../operation/Operation.ts"
import * as Request from "../request/Request.ts"
import type * as ThreadId from "../thread/ThreadId.ts"
import * as ThreadPermissions from "../thread/ThreadPermissions.ts"
import * as ThreadQuery from "../thread/ThreadQuery.ts"
import * as Channel from "./Channel.ts"
import type * as ChannelBinding from "./ChannelBinding.ts"
import * as ChannelBindingStore from "./ChannelBindingStore.ts"
import * as ChannelFacts from "./ChannelFacts.ts"
import * as ChannelId from "./ChannelId.ts"
import * as ChannelPermissions from "./ChannelPermissions.ts"
import * as ChannelQuery from "./ChannelQuery.ts"
import * as ChannelStore from "./ChannelStore.ts"

/**
 * What reading channels can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type ReadError = CoreError.NotFound | CoreError.Denied | CoreError.Invalid | CoreError.Unavailable

/**
 * What every change can fail with besides reading.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * What choosing a destination can fail with: the actor must belong to the group and be able to
 * start threads in it.
 *
 * @category errors
 * @since 0.1.0
 */
export type DestinationError = CoreError.NotFound | CoreError.Unavailable

/**
 * What creating a channel can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type CreateError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * What redirecting a channel can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type RedirectError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * What reading a thread's binding can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type BindingError = CoreError.NotFound | CoreError.Denied | CoreError.Invalid | CoreError.Unavailable

/**
 * The channel operations, one of `Core.Operations`.
 *
 * The channel operations.
 *
 * @category services
 * @since 0.1.0
 */
export class ChannelService extends Context.Service<
  ChannelService,
  {
    /**
     * Create a channel under `channel.create`: over a connection the actor may read and use, whose
     * integration gives channels, and into a group the actor belongs to and may start threads in,
     * since every member of that group will read the channel's conversations. Returns the channel.
     */
    readonly create: (
      input: Channel.CreateInput,
      options?: Request.Options
    ) => Effect.Effect<Channel.Channel, CreateError, Actor.Actor>
    /** The workspace's channels the actor may read, by name. */
    readonly list: Effect.Effect<ReadonlyArray<Channel.Channel>, ReadError, Actor.Actor>
    /**
     * One channel, under `channel.read`; one the actor may not read, or removed, is
     * `CoreError.NotFound`.
     */
    readonly get: (channelId: ChannelId.ChannelId) => Effect.Effect<Channel.Channel, ReadError, Actor.Actor>
    /**
     * Send the channel's conversations to come to another group, under `channel.manage`, which the
     * actor must belong to and be able to start threads in. Bound threads stay where they are.
     * Returns the channel as redirected.
     */
    readonly redirect: (input: Channel.RedirectInput) => Effect.Effect<Channel.Channel, RedirectError, Actor.Actor>
    /** Stop the channel's use under `channel.manage`; its record and its threads' bindings remain. */
    readonly remove: (channelId: ChannelId.ChannelId) => Effect.Effect<void, Error, Actor.Actor>
    /**
     * The external conversation a thread came from, under `thread.read`; a thread that came through
     * no channel, or that the actor cannot read, is `CoreError.NotFound`.
     */
    readonly getBinding: (
      threadId: ThreadId.ThreadId
    ) => Effect.Effect<ChannelBinding.ChannelBinding, BindingError, Actor.Actor>
  }
>()("@amends-dev/core/channel/ChannelService") {}

/** Channels by name, and by id among channels of one name. */
const byName = (left: Channel.Channel, right: Channel.Channel) =>
  left.name.localeCompare(right.name) || (left.id < right.id ? -1 : 1)

/**
 * Capture bound services; authorize each operation inside its commit.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const authorization = yield* Authorization.Authorization
  const groupQuery = yield* GroupQuery.GroupQuery
  const threadQuery = yield* ThreadQuery.ThreadQuery
  const channelQuery = yield* ChannelQuery.ChannelQuery
  const channelStore = yield* ChannelStore.ChannelStore
  const channelBindingStore = yield* ChannelBindingStore.ChannelBindingStore
  const connectionStore = yield* ConnectionStore.ConnectionStore
  const journal = yield* Journal.Journal
  const crypto = yield* Crypto.Crypto
  const { workspaceId } = yield* Store.Store

  const channelTarget = (channelId: ChannelId.ChannelId) =>
    Target.Reference.cases.Channel.make({ workspaceId, channelId })

  /** A channel the actor may act on with `permission`; to anyone else it is missing. */
  const requirePermitted = Effect.fnUntraced(function* (
    channelId: ChannelId.ChannelId,
    permission: Permission.Definition<"Channel">
  ) {
    const record = yield* channelQuery.requireActive(channelId)
    yield* Authorization.requireVisible(
      authorization,
      Requirement.make(ChannelPermissions.Read, channelTarget(channelId)),
      Requirement.make(permission, channelTarget(channelId)),
      () => new CoreError.NotFound({ resource: "Channel", id: channelId })
    )
    return record
  })

  /**
   * Require the actor to belong to the destination group and to be able to start threads in it:
   * choosing a destination is an audience decision for everyone in that group.
   */
  const requireDestination = Effect.fnUntraced(function* (groupId: GroupId.GroupId) {
    yield* groupQuery.requireAudience(groupId)
    yield* authorization.require([
      Requirement.make(ThreadPermissions.Start, Target.Reference.cases.Group.make({ workspaceId, groupId }))
    ])
  })

  /**
   * The connection the channel reaches its system through: active, readable and usable by the
   * actor, and of an integration that gives channels. Anything else is unavailable alike.
   */
  const requireUsableConnection = Effect.fnUntraced(function* (connectionId: ConnectionContract.ConnectionId) {
    const unavailable = () => new CoreError.Invalid({ reason: new CoreError.ConnectionUnusable({ connectionId }) })
    const found = yield* connectionStore.get(connectionId)
    if (Option.isNone(found) || found.value.status !== "active") return yield* unavailable()
    const target = Target.Reference.cases.Connection.make({ workspaceId, connectionId })
    const [readable = false, usable = false] = yield* authorization.permitted([
      Requirement.make(ConnectionPermissions.Read, target),
      Requirement.make(ConnectionPermissions.Use, target)
    ])
    if (!readable || !usable) return yield* unavailable()
    yield* channelQuery.integrationOf(found.value).pipe(Effect.catchTag("CoreError.Unavailable", unavailable))
    return found.value
  })

  const create = Effect.fn("ChannelService.create")(
    function* (input: Channel.CreateInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Schema.toType(Channel.CreateInput))(input)
      yield* authorization.require([
        Requirement.make(ChannelPermissions.Create, Target.Reference.cases.Workspace.make({ workspaceId }))
      ])
      const actor = yield* Actor.Actor
      const channelId = ChannelId.ChannelId.make(
        yield* Request.idFor(options.requestKey, ["channel.create", workspaceId, actor.memberId])
      )
      // A retry returns the channel its first attempt created, unless it was removed since.
      if (options.requestKey !== undefined && Option.isSome(yield* channelStore.get(channelId)))
        return yield* channelQuery.requireActive(channelId)
      yield* requireDestination(request.groupId)
      yield* requireUsableConnection(request.connectionId)
      const created: Channel.Channel = {
        id: channelId,
        workspaceId,
        connectionId: request.connectionId,
        groupId: request.groupId,
        name: request.name,
        opensTasks: request.opensTasks,
        status: "active",
        createdBy: actor.memberId,
        createdAt: yield* DateTime.now
      }
      yield* journal.publish(ChannelFacts.Created, created)
      return created
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const list = Effect.gen(function* () {
    yield* authorization.require([])
    const active = yield* channelStore.listActive
    const permitted = yield* authorization.permitted(
      active.map((record) => Requirement.make(ChannelPermissions.Read, channelTarget(record.id)))
    )
    return active.filter((_, index) => permitted[index] === true).toSorted(byName)
  }).pipe(Operation.report)

  const get = Effect.fn("ChannelService.get")(function* (channelId: ChannelId.ChannelId) {
    const id = yield* Schema.decodeEffect(ChannelId.ChannelId)(channelId)
    return yield* requirePermitted(id, ChannelPermissions.Read)
  }, Operation.report)

  const redirect = Effect.fn("ChannelService.redirect")(
    function* (input: Channel.RedirectInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Channel.RedirectInput))(input)
      const record = yield* requirePermitted(request.channelId, ChannelPermissions.Manage)
      if (record.groupId === request.groupId) return record
      yield* requireDestination(request.groupId)
      yield* journal.publish(ChannelFacts.Redirected, {
        workspaceId,
        channelId: record.id,
        groupId: request.groupId
      })
      return Channel.change(record, { groupId: request.groupId })
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const remove = Effect.fn("ChannelService.remove")(
    function* (channelId: ChannelId.ChannelId) {
      const id = yield* Schema.decodeEffect(ChannelId.ChannelId)(channelId)
      yield* requirePermitted(id, ChannelPermissions.Manage)
      yield* journal.publish(ChannelFacts.Removed, { workspaceId, channelId: id })
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  // Reads are outside journal.commit; an enclosing caller transaction remains authoritative.
  const getBinding = Effect.fn("ChannelService.getBinding")(function* (threadId: ThreadId.ThreadId) {
    const thread = yield* threadQuery.requireReadable(threadId)
    const binding = yield* channelBindingStore.get(thread.id)
    if (Option.isNone(binding)) return yield* new CoreError.NotFound({ resource: "ChannelBinding", id: thread.id })
    return binding.value
  }, Operation.report)

  return ChannelService.of({ create, list, get, redirect, remove, getBinding })
})

/**
 * Provide the channel operations over the shared reads, the stores, and authorization.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ChannelService, make)
