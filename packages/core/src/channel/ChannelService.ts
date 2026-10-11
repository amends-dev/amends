/**
 * The operations on channels an actor calls: creating one over a connection that gives channels,
 * reading them, redirecting one to another group, removing one, and reading which external
 * conversation a thread came from. Each operation authorizes the actor itself, writes inside one
 * journal commit, and reads outside any. What a channel receives is taken in by `ChannelIntake`,
 * and its replies carried out by deliveries, neither of which an actor calls.
 *
 * @since 0.1.0
 */
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import * as Authorization from "../authorization/authorization.ts";
import type * as Permission from "../authorization/permission.ts";
import * as Requirement from "../authorization/requirement.ts";
import * as ConnectionPermissions from "../connection/permissions.ts";
import * as ConnectionStore from "../connection/store.ts";
import type * as Connection from "../connection/connection.ts";
import type * as Group from "../group/group.ts";
import type * as GroupMembershipStore from "../group/membership/store.ts";
import * as GroupQuery from "../group/query.ts";
import * as Actor from "../identity/actor.ts";
import * as Journal from "../journal/journal.ts";
import type * as Log from "../journal/log.ts";
import type * as Projection from "../journal/projection.ts";
import * as Publication from "../journal/publication.ts";
import * as Store from "../journal/store.ts";
import * as Request from "../request/request.ts";
import type * as Thread from "../thread/Thread.ts";
import * as ThreadPermissions from "../thread/ThreadPermissions.ts";
import * as ThreadQuery from "../thread/ThreadQuery.ts";
import * as Channel from "./Channel.ts";
import type * as ChannelBinding from "./ChannelBinding.ts";
import * as ChannelBindingStore from "./ChannelBindingStore.ts";
import { ConnectionUnavailable, GroupNotFound, NotBound, NotFound } from "./ChannelErrors.ts";
import * as ChannelFacts from "./ChannelFacts.ts";
import * as ChannelPermissions from "./ChannelPermissions.ts";
import * as ChannelQuery from "./ChannelQuery.ts";
import * as ChannelStore from "./ChannelStore.ts";
export { ConnectionUnavailable, GroupNotFound, NotBound, NotFound } from "./ChannelErrors.ts";

/**
 * What reading channels can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type ReadError = Authorization.Error | ChannelStore.Failure | Schema.SchemaError | NotFound;

/**
 * What every change can fail with besides reading.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error = ReadError | PlatformError.PlatformError | Log.WriteError | Projection.Error;

/**
 * What choosing a destination can fail with: the actor must belong to the group and be able to
 * start threads in it.
 *
 * @category errors
 * @since 0.1.0
 */
export type DestinationError = GroupMembershipStore.Failure | GroupNotFound;

/**
 * What creating a channel can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type CreateError =
  | Error
  | DestinationError
  | ConnectionStore.Failure
  | ConnectionUnavailable;

/**
 * What redirecting a channel can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type RedirectError = Error | DestinationError;

/**
 * What reading a thread's binding can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type BindingError =
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound>
  | ChannelBindingStore.Failure
  | NotBound;

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
      options?: Request.Options,
    ) => Effect.Effect<Channel.Record, CreateError, Actor.Actor>;
    /** The workspace's channels the actor may read, by name. */
    readonly list: Effect.Effect<ReadonlyArray<Channel.Record>, ReadError, Actor.Actor>;
    /** One channel, under `channel.read`; one the actor may not read, or removed, is `NotFound`. */
    readonly get: (channelId: Channel.Id) => Effect.Effect<Channel.Record, ReadError, Actor.Actor>;
    /**
     * Send the channel's conversations to come to another group, under `channel.manage`, which the
     * actor must belong to and be able to start threads in. Bound threads stay where they are.
     * Returns the channel as redirected.
     */
    readonly redirect: (
      input: Channel.RedirectInput,
    ) => Effect.Effect<Channel.Record, RedirectError, Actor.Actor>;
    /** Stop the channel's use under `channel.manage`; its record and its threads' bindings remain. */
    readonly remove: (channelId: Channel.Id) => Effect.Effect<void, Error, Actor.Actor>;
    /**
     * The external conversation a thread came from, under `thread.read`; a thread that came through
     * no channel, or that the actor cannot read, is `NotBound`.
     */
    readonly getBinding: (
      threadId: Thread.Id,
    ) => Effect.Effect<ChannelBinding.Record, BindingError, Actor.Actor>;
  }
>()("@amends-dev/core/channel/ChannelService") {}

/** Channels by name, and by id among channels of one name. */
const byName = (left: Channel.Record, right: Channel.Record) =>
  left.name.localeCompare(right.name) || (left.id < right.id ? -1 : 1);

/**
 * Capture bound services; authorize each operation inside its commit.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ChannelService.make")(function* () {
  const authorization = yield* Authorization.Authorization;
  const groupQuery = yield* GroupQuery.GroupQuery;
  const threadQuery = yield* ThreadQuery.ThreadQuery;
  const channelQuery = yield* ChannelQuery.ChannelQuery;
  const channelStore = yield* ChannelStore.ChannelStore;
  const channelBindingStore = yield* ChannelBindingStore.ChannelBindingStore;
  const connectionStore = yield* ConnectionStore.ConnectionStore;
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;

  const channelTarget = (channelId: Channel.Id) =>
    ({ _tag: "Channel", workspaceId, channelId }) as const;

  /** A channel the actor may act on with `permission`; to anyone else it is missing. */
  const requirePermitted = Effect.fnUntraced(function* (
    channelId: Channel.Id,
    permission: Permission.Definition<"Channel">,
  ) {
    const record = yield* channelQuery.requireActive(channelId);
    yield* Authorization.requireVisible(
      authorization,
      Requirement.make(ChannelPermissions.Read, channelTarget(channelId)),
      Requirement.make(permission, channelTarget(channelId)),
      () => new NotFound({ channelId }),
    );
    return record;
  });

  /**
   * Require the actor to belong to the destination group and to be able to start threads in it:
   * choosing a destination is an audience decision for everyone in that group.
   */
  const requireDestination = Effect.fnUntraced(function* (groupId: Group.Id) {
    yield* groupQuery
      .requireAudience(groupId)
      .pipe(Effect.catchTag("GroupQuery.NotMember", () => new GroupNotFound({ groupId })));
    yield* authorization.require([
      Requirement.make(ThreadPermissions.Start, { _tag: "Group", workspaceId, groupId }),
    ]);
  });

  /**
   * The connection the channel reaches its system through: active, readable and usable by the
   * actor, and of an integration that gives channels. Anything else is unavailable alike.
   */
  const requireUsableConnection = Effect.fnUntraced(function* (connectionId: Connection.Id) {
    const unavailable = () => new ConnectionUnavailable({ connectionId });
    const found = yield* connectionStore.get(connectionId);
    if (Option.isNone(found) || found.value.status !== "active") return yield* unavailable();
    const target = { _tag: "Connection", workspaceId, connectionId } as const;
    const [readable = false, usable = false] = yield* authorization.permitted([
      Requirement.make(ConnectionPermissions.Read, target),
      Requirement.make(ConnectionPermissions.Use, target),
    ]);
    if (!readable || !usable) return yield* unavailable();
    yield* channelQuery
      .integrationOf(found.value)
      .pipe(Effect.catchTag("ChannelQuery.Unavailable", unavailable));
    return found.value;
  });

  const create = Effect.fn("ChannelService.create")(
    function* (input: Channel.CreateInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Schema.toType(Channel.CreateInput))(input);
      yield* authorization.require([
        Requirement.make(ChannelPermissions.Create, { _tag: "Workspace", workspaceId }),
      ]);
      const actor = yield* Actor.Actor;
      const channelId = Channel.Id.make(
        yield* Request.idFor(options.requestKey, ["channel.create", workspaceId, actor.memberId]),
      );
      // A retry returns the channel its first attempt created, unless it was removed since.
      if (options.requestKey !== undefined && Option.isSome(yield* channelStore.get(channelId)))
        return yield* channelQuery.requireActive(channelId);
      yield* requireDestination(request.groupId);
      yield* requireUsableConnection(request.connectionId);
      const created: Channel.Record = {
        id: channelId,
        workspaceId,
        connectionId: request.connectionId,
        groupId: request.groupId,
        name: request.name,
        opensTasks: request.opensTasks,
        status: "active",
        createdBy: actor.memberId,
        createdAt: yield* DateTime.now,
      };
      yield* journal.publish(ChannelFacts.Created, created);
      return created;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const list = Effect.gen(function* () {
    yield* authorization.require([]);
    const active = yield* channelStore.listActive;
    const permitted = yield* authorization.permitted(
      active.map((record) => Requirement.make(ChannelPermissions.Read, channelTarget(record.id))),
    );
    return active.filter((_, index) => permitted[index] === true).toSorted(byName);
  });

  const get = Effect.fn("ChannelService.get")(function* (channelId: Channel.Id) {
    const id = yield* Schema.decodeEffect(Channel.Id)(channelId);
    return yield* requirePermitted(id, ChannelPermissions.Read);
  });

  const redirect = Effect.fn("ChannelService.redirect")(
    function* (input: Channel.RedirectInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Channel.RedirectInput))(input);
      const record = yield* requirePermitted(request.channelId, ChannelPermissions.Manage);
      if (record.groupId === request.groupId) return record;
      yield* requireDestination(request.groupId);
      yield* journal.publish(ChannelFacts.Redirected, {
        workspaceId,
        channelId: record.id,
        groupId: request.groupId,
      });
      return Channel.change(record, { groupId: request.groupId });
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const remove = Effect.fn("ChannelService.remove")(
    function* (channelId: Channel.Id) {
      const id = yield* Schema.decodeEffect(Channel.Id)(channelId);
      yield* requirePermitted(id, ChannelPermissions.Manage);
      yield* journal.publish(ChannelFacts.Removed, { workspaceId, channelId: id });
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  // Reads are outside journal.commit; an enclosing caller transaction remains authoritative.
  const getBinding = Effect.fn("ChannelService.getBinding")(function* (threadId: Thread.Id) {
    const thread = yield* threadQuery
      .requireReadable(threadId)
      .pipe(
        Effect.catchTag(
          "ThreadQuery.NotFound",
          (error) => new NotBound({ threadId: error.threadId }),
        ),
      );
    const binding = yield* channelBindingStore.get(thread.id);
    if (Option.isNone(binding)) return yield* new NotBound({ threadId: thread.id });
    return binding.value;
  });

  return ChannelService.of({ create, list, get, redirect, remove, getBinding });
});

/**
 * Provide the channel operations over the shared reads, the stores, and authorization.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ChannelService, make());
