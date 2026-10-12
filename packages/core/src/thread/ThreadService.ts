/**
 * The operations on threads an actor calls: starting one in a group, as a task or not, or with the
 * members of a direct conversation, renaming one, and reading threads, their timelines, and their
 * participants. Replies are `ThreadMessageService`, following is `ThreadParticipationService`, and
 * a task once it exists is `TaskService`. Each operation authorizes the actor itself, writes inside
 * one journal commit, and reads outside any.
 *
 * @since 0.1.0
 */
import * as Identity from "../identity/Identity.ts";
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import * as AgentPermissions from "../agent/AgentPermissions.ts";
import * as Authorization from "../authorization/Authorization.ts";
import * as Requirement from "../authorization/Requirement.ts";
import * as Actor from "../identity/Actor.ts";
import * as Group from "../group/Group.ts";
import * as GroupQuery from "../group/GroupQuery.ts";
import * as GroupMembershipStore from "../group/GroupMembershipStore.ts";
import * as Member from "../workspace/Member.ts";
import * as MemberStore from "../workspace/MemberStore.ts";
import * as Journal from "../journal/Journal.ts";
import type * as Log from "../journal/Log.ts";
import type * as Projection from "../journal/Projection.ts";
import * as Publication from "../journal/Publication.ts";
import * as Store from "../journal/Store.ts";
import * as Thread from "./Thread.ts";
import * as ThreadStore from "./ThreadStore.ts";
import * as ThreadCommand from "./ThreadCommand.ts";
import * as GroupStore from "../group/GroupStore.ts";
import * as GroupCommand from "../group/GroupCommand.ts";
import type * as GroupFollowStore from "../group/GroupFollowStore.ts";
import * as ThreadQuery from "./ThreadQuery.ts";
import * as ThreadPermissions from "./ThreadPermissions.ts";
import * as ThreadMessageStore from "./ThreadMessageStore.ts";
import * as ThreadParticipation from "./ThreadParticipation.ts";
import * as ThreadParticipationStore from "./ThreadParticipationStore.ts";
import * as ThreadActivityResolvers from "./ThreadActivityResolvers.ts";
import * as ThreadActivityStore from "./ThreadActivityStore.ts";
import * as ThreadActivityKind from "./ThreadActivityKind.ts";
import * as ThreadMessageActivity from "./ThreadMessageActivity.ts";
import * as ThreadMessage from "./ThreadMessage.ts";
import * as ThreadFacts from "./ThreadFacts.ts";
import * as ThreadTitleActivity from "./ThreadTitleActivity.ts";
import * as ReadStateStore from "../read-state/ReadStateStore.ts";
import * as Request from "../request/Request.ts";
import * as Task from "../task/Task.ts";
import * as TaskCommand from "../task/TaskCommand.ts";
import * as TaskPermissions from "../task/TaskPermissions.ts";
import * as TaskStore from "../task/TaskStore.ts";
import {
  DirectMembersRequired,
  HumanAuthorRequired,
  ParticipantUnavailable,
} from "./internal/thread-errors.ts";
import * as CoreError from "../error/CoreError.ts";
export {
  /**
   * A direct group needs the author and at least one other member.
   *
   * @category errors
   * @since 0.1.0
   */
  DirectMembersRequired,
  /**
   * An agent asked to start a thread; only people start them, and agents' messages come from
   * their turns.
   *
   * @category errors
   * @since 0.1.0
   */
  HumanAuthorRequired,
  /**
   * A member who was to take part cannot: they are missing, inactive, or not in the group.
   *
   * @category errors
   * @since 0.1.0
   */
  ParticipantUnavailable,
} from "./internal/thread-errors.ts";

/**
 * What starting a thread can fail with: the outcomes above, and the failures of what
 * a start depends on.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | Authorization.Error
  | Exclude<ThreadCommand.Error, ThreadCommand.Unavailable>
  | Exclude<TaskCommand.Error, ThreadCommand.Unavailable>
  | Exclude<GroupCommand.EstablishError, GroupCommand.Unavailable>
  | GroupStore.Failure
  | GroupMembershipStore.Failure
  | GroupFollowStore.Failure
  | ReadStateStore.Failure
  | ReadStateStore.Conflict
  | MemberStore.Failure
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error
  | CoreError.NotFound
  | ParticipantUnavailable
  | HumanAuthorRequired
  | DirectMembersRequired
  | ThreadStore.Failure
  | ThreadMessageStore.Failure
  | ThreadActivityStore.Failure
  | TaskStore.Failure;

/**
 * What renaming a thread can fail with: the outcomes above, and the failures of what
 * a rename depends on.
 *
 * @category errors
 * @since 0.1.0
 */
export type RenameError =
  | Authorization.Error
  | Exclude<ThreadCommand.Error, ThreadCommand.Unavailable>
  | GroupMembershipStore.Failure
  | TaskStore.Failure
  | CoreError.NotFound
  | CoreError.Changed;

/**
 * What reading threads can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type ReadError =
  | ThreadQuery.ListError
  | MemberStore.Failure
  | ThreadMessageStore.Failure
  | ThreadActivityStore.Failure
  | ThreadActivityResolvers.Failure
  | ThreadParticipationStore.Failure
  | CoreError.NotFound;

/**
 * The thread operations, one of `Core.Operations`.
 *
 * The thread operations.
 *
 * @category services
 * @since 0.1.0
 */
export class ThreadService extends Context.Service<
  ThreadService,
  {
    /**
     * Start a thread in a group the author belongs to. A team thread starts with its author,
     * mentioned members, and the group's followers; the rest of the group can read it without
     * participating. A direct-group thread enrolls all of its members, and mentions only narrow who
     * is notified. Only mentioned agents need the author's agent-use authority. A thread derived
     * from an `origin` the author can read names it. Started as a task, under `task.create` on the
     * group, the thread's second activity creates the task, admitting its assignee, who must be able
     * to take part, and triage while it is in triage; assigning an agent needs `agent.use` on it.
     */
    readonly startInGroup: (
      input: Thread.StartInGroupInput,
      options?: Request.Options,
    ) => Effect.Effect<Thread.Started, Error, Actor.Actor>;
    /**
     * Establish or reuse the direct group for the author and the given members, then start a
     * thread with all of them. Needs active membership, agent use for every named agent, and
     * thread.start on the direct group; no group-management permission.
     */
    readonly startDirect: (
      input: Thread.StartDirectInput,
      options?: Request.Options,
    ) => Effect.Effect<Thread.Started, Error, Actor.Actor>;
    /**
     * Give a thread a title, under current group audience and `thread.rename` on the thread. The
     * same title again records nothing; otherwise a title other than `expectedTitle` is
     * `CoreError.Changed`, and nothing is recorded. A rename publishes its fact and records a quiet
     * `thread.renamed` activity in one commit, and returns the renamed thread.
     */
    readonly rename: (
      input: Thread.RenameInput,
    ) => Effect.Effect<Thread.Thread, RenameError, Actor.Actor>;
    /**
     * The thread, under current group audience and `thread.read`. Reading creates no participation
     * and marks nothing seen.
     */
    readonly get: (threadId: Thread.Id) => Effect.Effect<Thread.Thread, ReadError, Actor.Actor>;
    /**
     * One page of a group's threads the actor can read, newest latest activity first, each with the
     * actor's read position and unread state. Requires current group membership; `thread.read` is
     * checked for the whole page at once, and threads it does not cover are skipped.
     */
    readonly listInGroup: (
      groupId: Group.Id,
      options: Thread.ListOptions,
    ) => Effect.Effect<ReadonlyArray<Thread.ListItem>, ReadError, Actor.Actor>;
    /**
     * One page of a group's threads the actor can read, newest start first, as its stream shows them:
     * each with its opening message, reply count, latest message, and the actor's position and unread
     * state, under the same rules as `listInGroup`. A page reads a fixed number of times, however
     * many threads it holds.
     */
    readonly listOpenings: (
      groupId: Group.Id,
      options: Thread.OpeningOptions,
    ) => Effect.Effect<ReadonlyArray<Thread.Opening>, ReadError, Actor.Actor>;
    /** Bounded activity page with resolved subjects, ordered by sequence. The cursor is exclusive. */
    readonly readTimeline: (
      threadId: Thread.Id,
      options: ThreadActivityStore.ReadOptions,
    ) => Effect.Effect<ReadonlyArray<Thread.TimelineItem>, ReadError, Actor.Actor>;
    /**
     * A page of current participants: active participations backed by current workspace and group
     * admissions, in participation-ID order after the exclusive cursor, with public member
     * references only.
     */
    readonly listParticipants: (
      threadId: Thread.Id,
      options: ThreadParticipation.ListOptions,
    ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Summary>, ReadError, Actor.Actor>;
  }
>()("@amends-dev/core/thread/ThreadService") {}

/**
 * Capture bound services; authorize the complete requested conversation inside its commit.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ThreadService.make")(function* () {
  const authorization = yield* Authorization.Authorization;
  const groupQuery = yield* GroupQuery.GroupQuery;
  const threadCommand = yield* ThreadCommand.ThreadCommand;
  const groupStore = yield* GroupStore.GroupStore;
  const groupCommand = yield* GroupCommand.GroupCommand;
  const threadQuery = yield* ThreadQuery.ThreadQuery;
  const threadStore = yield* ThreadStore.ThreadStore;
  const readStateStore = yield* ReadStateStore.ReadStateStore;
  const threadMessageStore = yield* ThreadMessageStore.ThreadMessageStore;
  const threadActivityStore = yield* ThreadActivityStore.ThreadActivityStore;
  const taskCommand = yield* TaskCommand.TaskCommand;
  const taskStore = yield* TaskStore.TaskStore;
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;
  /**
   * The IDs a start gives its thread and opening message. Without a key they are new each time. A
   * keyed start derives them from its author and key, so a retry names what its first attempt
   * started.
   */
  const deriveStartIds = Effect.fnUntraced(function* (
    operation: string,
    key: Request.Key | undefined,
  ) {
    const actor = yield* Actor.Actor;
    const parts = [operation, workspaceId, actor.memberId];
    const threadId = Thread.Id.make(yield* Request.idFor(key, [...parts, "thread"]));
    const messageId = ThreadMessage.Id.make(yield* Request.idFor(key, [...parts, "message"]));
    return { threadId, messageId };
  });

  /** What an earlier attempt of this keyed start created, so a retry returns it; None otherwise. */
  const findRetriedStart = Effect.fnUntraced(function* (
    key: Request.Key | undefined,
    ids: { readonly threadId: Thread.Id; readonly messageId: ThreadMessage.Id },
  ) {
    if (key === undefined) return Option.none<Thread.Started>();
    const thread = yield* threadStore.get(ids.threadId);
    if (Option.isNone(thread)) return Option.none<Thread.Started>();
    const message = yield* threadMessageStore.get(ids.messageId);
    if (Option.isNone(message))
      return yield* Effect.die("A started thread's opening message is missing");
    const task = yield* taskStore.get(ids.threadId);
    return Option.some<Thread.Started>({
      thread: thread.value,
      message: message.value,
      task: Option.getOrNull(task),
    });
  });

  /**
   * Require every starting participant to be able to take part, and the author's agent-use grant
   * for each agent the author names. Agents that take part without being named need none.
   */
  const authorizeParticipants = Effect.fnUntraced(function* (
    participants: ReadonlyArray<Member.Id>,
    named: ReadonlyArray<Member.Id>,
    eligible: ReadonlyMap<Member.Id, ThreadQuery.Eligible>,
  ) {
    for (const memberId of participants)
      if (!eligible.has(memberId)) return yield* new ParticipantUnavailable({ memberId });
    for (const memberId of named) {
      const member = eligible.get(memberId)?.member;
      if (member === undefined) return yield* new ParticipantUnavailable({ memberId });
      if (Identity.MemberReference.isAnyOf(["Agent"])(member.identity))
        yield* authorization.require([
          Requirement.make(AgentPermissions.Use, { _tag: "Member", workspaceId, memberId }),
        ]);
    }
  });

  /**
   * Require `task.create` on the group, and the assignee, if one, to be able to take part there,
   * with the author's agent use when the assignee is an agent, since assigning one directs it.
   */
  const authorizeTask = Effect.fnUntraced(function* (groupId: Group.Id, task: Task.Options) {
    yield* authorization.require([
      Requirement.make(TaskPermissions.Create, { _tag: "Group", workspaceId, groupId }),
    ]);
    if (task.assignee === undefined) return;
    const eligible = yield* threadQuery.eligibleMembers(groupId, [task.assignee]);
    yield* authorizeParticipants([task.assignee], [task.assignee], eligible);
  });

  /**
   * Create the thread with its author's opening message, which the author has then read, and as a
   * task at its second position when the start asks for one, so a task never lacks a description.
   */
  const createThread = Effect.fnUntraced(function* (
    authorId: Member.Id,
    groupId: Group.Id,
    participants: ReadonlyArray<Member.Id>,
    opening: {
      readonly title?: Thread.Title;
      readonly origin?: Thread.Id;
      readonly text: ThreadMessage.Text;
      readonly mentions: ReadonlyArray<Member.Id>;
      readonly task?: Task.Options;
    },
    ids: { readonly threadId: Thread.Id; readonly messageId: ThreadMessage.Id },
  ) {
    const unavailable = (error: ThreadCommand.Unavailable) =>
      new ParticipantUnavailable({ memberId: error.memberId });
    const occurredAt = yield* DateTime.now;
    const started = yield* threadCommand
      .create({
        threadId: ids.threadId,
        groupId,
        title: opening.title ?? null,
        origin: opening.origin ?? null,
        participants: participants.map((memberId) => ({ _tag: "Member" as const, memberId })),
        message: {
          messageId: ids.messageId,
          author: { _tag: "Member", memberId: authorId },
          text: opening.text,
          mentions: opening.mentions,
          via: null,
        },
        occurredAt,
      })
      .pipe(Effect.catchTag("ThreadCommand.Unavailable", unavailable));
    // Posting reads the thread through the author's own message.
    yield* readStateStore.markThreadRead(
      {
        workspaceId,
        memberId: authorId,
        threadId: started.thread.id,
        readThrough: started.activity.sequence,
      },
      occurredAt,
    );
    const task =
      opening.task === undefined
        ? null
        : (yield* taskCommand
            .create({
              thread: started.thread,
              ...Task.initial(opening.task),
              createdBy: started.thread.createdBy,
              by: { _tag: "Member", memberId: authorId },
              occurredAt,
            })
            .pipe(Effect.catchTag("ThreadCommand.Unavailable", unavailable))).task;
    return { thread: started.thread, message: started.message, task } satisfies Thread.Started;
  });

  /**
   * Who a thread in a direct group starts with: every member who can take part, and those who can,
   * for authorizing them.
   */
  const directStarters = Effect.fnUntraced(function* (group: Group.Direct) {
    const eligible = yield* threadQuery.eligibleMembers(group.id, group.memberIds);
    return { starters: [...eligible.keys()].sort(), eligible };
  });

  /**
   * Who a thread in a team group starts with: its author, the members its opening message
   * mentions, and the group's followers whose follow is through their current admission; the rest
   * of the group sees it as unread, so only these members' admissions are read.
   */
  const teamStarters = Effect.fnUntraced(function* (
    groupId: Group.Id,
    authorId: Member.Id,
    mentions: ReadonlyArray<Member.Id>,
  ) {
    const followers = yield* threadQuery.followers(groupId);
    const named = yield* threadQuery.eligibleMembers(groupId, [authorId, ...mentions]);
    const eligible = new Map([
      ...named,
      ...followers.map((follower) => [follower.member.id, follower] as const),
    ]);
    const followerIds = followers.map((follower) => follower.member.id).sort();
    return { starters: [...new Set([authorId, ...mentions, ...followerIds])], eligible };
  });

  const startDirect = Effect.fn("ThreadService.startDirect")(
    function* (input: Thread.StartDirectInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Thread.StartDirectInput)(input);
      yield* authorization.require([]);
      const actor = yield* Actor.Actor;
      if (!Identity.MemberReference.isAnyOf(["Human"])(actor.identity))
        return yield* new HumanAuthorRequired({ memberId: actor.memberId });
      const memberIds = Group.directMembers([actor.memberId, ...request.memberIds]);
      if (memberIds.length < 2) return yield* new DirectMembersRequired({});
      const missing = request.mentions.find((id) => !memberIds.includes(id));
      if (missing !== undefined) return yield* new ParticipantUnavailable({ memberId: missing });
      const { group, created } = yield* groupCommand
        .establishDirect(memberIds, actor.memberId, yield* DateTime.now)
        .pipe(
          Effect.catchTag(
            "GroupCommand.Unavailable",
            (error) => new ParticipantUnavailable({ memberId: error.memberId }),
          ),
        );
      yield* authorization.require([
        Requirement.make(ThreadPermissions.Start, {
          _tag: "Group",
          workspaceId,
          groupId: group.id,
        }),
      ]);
      const ids = yield* deriveStartIds("thread.start-direct", options.requestKey);
      const retried = yield* findRetriedStart(options.requestKey, ids);
      if (Option.isSome(retried)) return retried.value;
      const eligible = yield* threadQuery.eligibleMembers(group.id, memberIds);
      // Creating the group gives its agents a place in all of its threads, as making an agent
      // follow a team group does, so it needs agent use on each; later starts name only mentions.
      yield* authorizeParticipants(memberIds, created ? memberIds : request.mentions, eligible);
      return yield* createThread(actor.memberId, group.id, memberIds, request, ids);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const startInGroup = Effect.fn("ThreadService.startInGroup")(
    function* (input: Thread.StartInGroupInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Thread.StartInGroupInput)(input);
      yield* groupQuery.requireAudience(request.groupId);
      yield* authorization.require([
        Requirement.make(ThreadPermissions.Start, {
          _tag: "Group",
          workspaceId,
          groupId: request.groupId,
        }),
      ]);
      const actor = yield* Actor.Actor;
      if (!Identity.MemberReference.isAnyOf(["Human"])(actor.identity))
        return yield* new HumanAuthorRequired({ memberId: actor.memberId });
      const ids = yield* deriveStartIds("thread.start", options.requestKey);
      const retried = yield* findRetriedStart(options.requestKey, ids);
      if (Option.isSome(retried)) return retried.value;
      const foundGroup = yield* groupStore.get(request.groupId);
      if (Option.isNone(foundGroup)) return yield* Effect.die("An audience's group is missing");
      const group = foundGroup.value;
      const { starters, eligible } =
        group.kind === "Direct"
          ? yield* directStarters(group)
          : yield* teamStarters(group.id, actor.memberId, request.mentions);
      yield* authorizeParticipants(starters, request.mentions, eligible);
      // Work is split out of a thread its author can read; to anyone else the origin is missing.
      if (request.origin !== undefined) yield* threadQuery.requireReadable(request.origin);
      if (request.task !== undefined) yield* authorizeTask(group.id, request.task);
      return yield* createThread(actor.memberId, request.groupId, starters, request, ids);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const rename = Effect.fn("ThreadService.rename")(
    function* (input: Thread.RenameInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Thread.RenameInput))(input);
      // Only its group's members may rename a thread; to anyone else it is missing.
      const thread = yield* threadQuery.requireAccess(request.threadId);
      yield* authorization.require([
        Requirement.make(ThreadPermissions.Rename, {
          _tag: "Thread",
          workspaceId,
          threadId: thread.id,
        }),
      ]);
      if (thread.title === request.title) return thread;
      if (thread.title !== request.expectedTitle)
        return yield* new CoreError.Changed({ resource: "Thread", id: thread.id });
      const occurredAt = yield* DateTime.now;
      // A task's title is a requirement: every participant is told of it, and the assignee asked
      // to work on it anew; a conversation's title tells no one.
      const task = yield* taskStore.get(thread.id);
      const actor = yield* Actor.Actor;
      const recipients = Option.isNone(task)
        ? []
        : Task.recipients(
            yield* threadQuery.currentParticipants(thread),
            { _tag: "Member", memberId: actor.memberId },
            Task.asked(task.value),
          );
      const renamed = yield* threadCommand
        .publishActivity({
          thread,
          occurredAt,
          step: () =>
            Effect.gen(function* () {
              const fact = yield* journal
                .publish(ThreadFacts.Renamed, {
                  workspaceId,
                  threadId: thread.id,
                  groupId: thread.groupId,
                  title: request.title,
                })
                .pipe(Publication.withOccurredAt(occurredAt));
              return {
                value: Object.assign({}, thread, { title: request.title }) satisfies Thread.Thread,
                kind: ThreadTitleActivity.Renamed,
                details: { title: request.title, previous: thread.title },
                recipients,
                cause: fact,
              };
            }),
        })
        .pipe(
          Effect.catchTag("ThreadCommand.Unavailable", () =>
            Effect.die("A rename admits no participant"),
          ),
        );
      return renamed.value;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  // Reads are deliberately outside journal.commit; an enclosing caller transaction remains
  // authoritative when present.
  const get = Effect.fn("ThreadService.get")((threadId: Thread.Id) =>
    threadQuery.requireReadable(threadId),
  );

  const listInGroup = Effect.fn("ThreadService.listInGroup")(function* (
    groupId: Group.Id,
    input: Thread.ListOptions,
  ) {
    const options = yield* Schema.decodeEffect(Schema.toType(Thread.ListOptions))(input);
    return yield* threadQuery.listReadable(groupId, {
      limit: options.limit,
      first: options.before,
      list: (before) =>
        threadStore.listByLatest(
          groupId,
          before === undefined ? { limit: options.limit } : { before, limit: options.limit },
        ),
      threadOf: (thread) => thread,
      cursorOf: (thread, latest): Thread.ListCursor => ({
        latestActivityAt: latest.occurredAt,
        threadId: thread.id,
      }),
    });
  });

  const listOpenings = Effect.fn("ThreadService.listOpenings")(function* (
    groupId: Group.Id,
    input: Thread.OpeningOptions,
  ) {
    const options = yield* Schema.decodeEffect(Schema.toType(Thread.OpeningOptions))(input);
    const items = yield* threadQuery.listReadable(groupId, {
      limit: options.limit,
      first: options.before,
      list: (before) =>
        threadStore.listByStart(
          groupId,
          before === undefined ? { limit: options.limit } : { before, limit: options.limit },
        ),
      threadOf: (thread) => thread,
      cursorOf: (thread): Thread.OpeningCursor => ({
        createdAt: thread.createdAt,
        threadId: thread.id,
      }),
    });
    if (items.length === 0) return [];
    // A start publishes its opening message as the thread's first activity.
    const ids = items.map((item) => item.thread.id);
    const openings = new Map<Thread.Id, ThreadMessage.Id>();
    for (const activity of yield* threadActivityStore.getFirst(ids)) {
      const opening = yield* Effect.orDie(
        ThreadActivityKind.decode(ThreadMessageActivity.Published, activity),
      );
      openings.set(activity.threadId, opening.details.messageId);
    }
    const found = new Map(
      (yield* threadMessageStore.getMany([...openings.values()])).map(
        (message) => [message.id, message] as const,
      ),
    );
    // Replies are the thread's messages after its opening one that still have text.
    const counts = new Map(
      (yield* threadMessageStore.countByThread(ids)).map(
        (value) => [value.threadId, value.count] as const,
      ),
    );
    const result: Array<Thread.Opening> = [];
    for (const item of items) {
      const messageId = openings.get(item.thread.id);
      const message = messageId === undefined ? undefined : found.get(messageId);
      if (message === undefined) return yield* Effect.die("A listed thread's opening is missing");
      const remaining = counts.get(item.thread.id) ?? 0;
      const opening = ThreadMessage.Content.isAnyOf(["Text"])(message.content) ? 1 : 0;
      result.push(Thread.opening(item, message, remaining - opening));
    }
    return result;
  });

  const readTimeline = Effect.fn("ThreadService.readTimeline")(
    (threadId: Thread.Id, options: ThreadActivityStore.ReadOptions) =>
      threadQuery.readTimeline(threadId, options),
  );

  const listParticipants = Effect.fn("ThreadService.listParticipants")(function* (
    threadId: Thread.Id,
    options: ThreadParticipation.ListOptions,
  ) {
    const thread = yield* threadQuery.requireReadable(threadId);
    const participants = yield* threadQuery.pageParticipants(thread, options);
    return participants.map(ThreadParticipation.toSummary);
  });
  return ThreadService.of({
    startInGroup,
    startDirect,
    rename,
    get,
    listInGroup,
    listOpenings,
    readTimeline,
    listParticipants,
  });
});

/**
 * Provide the thread operations over the shared reads and writes, the stores, and authorization.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ThreadService, make());
