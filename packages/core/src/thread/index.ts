/**
 * Threads: one conversation in exactly one group, with participants and an ordered timeline of
 * typed activity. `Thread`, `ThreadMessage`, and `ThreadParticipation` are the records;
 * `ThreadActivity` and `ThreadActivityKind` the timeline and how domains add kinds to it;
 * `ThreadService`, `ThreadMessageService`, and `ThreadParticipationService` the operations an
 * actor calls; `ThreadQuery` and `ThreadCommand` the reads and writes other domains share; and the
 * stores the contracts every storage adapter implements.
 *
 * @since 0.1.0
 */

/**
 * A thread's record, the views lists show of it, and the inputs that start and rename one.
 *
 * @since 0.1.0
 */
export { Thread } from "./Thread.ts";

/**
 * One item of a thread's timeline, in the shape every kind shares, and the recipients recorded
 * with it.
 *
 * @since 0.1.0
 */
export { ThreadActivity } from "./ThreadActivity.ts";

/**
 * The one fact every kind of activity is recorded with.
 *
 * @since 0.1.0
 */
export { ThreadActivityFacts } from "./ThreadActivityFacts.ts";

/**
 * How a domain defines a kind of activity, and how activity of that kind is recorded and read.
 *
 * @since 0.1.0
 */
export { ThreadActivityKind } from "./ThreadActivityKind.ts";

/**
 * The projection that keeps a thread's timeline.
 *
 * @since 0.1.0
 */
export { ThreadActivityProjection } from "./ThreadActivityProjection.ts";

/**
 * How recorded activity becomes timeline items: one resolver per domain, routed by kind.
 *
 * @since 0.1.0
 */
export { ThreadActivityResolvers } from "./ThreadActivityResolvers.ts";

/**
 * The storage contract for activity.
 *
 * @since 0.1.0
 */
export { ThreadActivityStore } from "./ThreadActivityStore.ts";

/**
 * The writes to threads that operations share, run inside the caller's commit.
 *
 * @since 0.1.0
 */
export { ThreadCommand } from "./ThreadCommand.ts";

/**
 * The outcomes `ThreadService` reports that a caller can act on.
 *
 * @since 0.1.0
 */
export { ThreadErrors } from "./ThreadErrors.ts";

/**
 * The facts recorded about a thread itself.
 *
 * @since 0.1.0
 */
export { ThreadFacts } from "./ThreadFacts.ts";

/**
 * The identity of a thread.
 *
 * @since 0.1.0
 */
export { ThreadId } from "./ThreadId.ts";

/**
 * A message: markdown written by a member or a contact, and whom it addresses.
 *
 * @since 0.1.0
 */
export { ThreadMessage } from "./ThreadMessage.ts";

/**
 * The kind of activity a message records in its thread's timeline.
 *
 * @since 0.1.0
 */
export { ThreadMessageActivity } from "./ThreadMessageActivity.ts";

/**
 * The outcomes `ThreadMessageService` reports that a caller can act on.
 *
 * @since 0.1.0
 */
export { ThreadMessageErrors } from "./ThreadMessageErrors.ts";

/**
 * The facts recorded about messages.
 *
 * @since 0.1.0
 */
export { ThreadMessageFacts } from "./ThreadMessageFacts.ts";

/**
 * The identity of a message.
 *
 * @since 0.1.0
 */
export { ThreadMessageId } from "./ThreadMessageId.ts";

/**
 * The action on messages that needs a grant.
 *
 * @since 0.1.0
 */
export { ThreadMessagePermissions } from "./ThreadMessagePermissions.ts";

/**
 * The projection that keeps the message read model.
 *
 * @since 0.1.0
 */
export { ThreadMessageProjection } from "./ThreadMessageProjection.ts";

/**
 * The operations on messages an actor calls: replying, and saying one is typing.
 *
 * @since 0.1.0
 */
export { ThreadMessageService } from "./ThreadMessageService.ts";

/**
 * The storage contract for messages.
 *
 * @since 0.1.0
 */
export { ThreadMessageStore } from "./ThreadMessageStore.ts";

/**
 * How messages appear in a timeline.
 *
 * @since 0.1.0
 */
export { ThreadMessageTimeline } from "./ThreadMessageTimeline.ts";

/**
 * Who takes part in a thread, and from where in it.
 *
 * @since 0.1.0
 */
export { ThreadParticipation } from "./ThreadParticipation.ts";

/**
 * The kinds of activity participation records in a thread's timeline.
 *
 * @since 0.1.0
 */
export { ThreadParticipationActivity } from "./ThreadParticipationActivity.ts";

/**
 * The outcomes `ThreadParticipationService` reports that a caller can act on.
 *
 * @since 0.1.0
 */
export { ThreadParticipationErrors } from "./ThreadParticipationErrors.ts";

/**
 * The facts recorded about participations.
 *
 * @since 0.1.0
 */
export { ThreadParticipationFacts } from "./ThreadParticipationFacts.ts";

/**
 * The identity of a participation.
 *
 * @since 0.1.0
 */
export { ThreadParticipationId } from "./ThreadParticipationId.ts";

/**
 * The action on participation that needs a grant.
 *
 * @since 0.1.0
 */
export { ThreadParticipationPermissions } from "./ThreadParticipationPermissions.ts";

/**
 * The projection that keeps the participation read model.
 *
 * @since 0.1.0
 */
export { ThreadParticipationProjection } from "./ThreadParticipationProjection.ts";

/**
 * The operations on participation an actor calls: following and unfollowing.
 *
 * @since 0.1.0
 */
export { ThreadParticipationService } from "./ThreadParticipationService.ts";

/**
 * The storage contract for participations.
 *
 * @since 0.1.0
 */
export { ThreadParticipationStore } from "./ThreadParticipationStore.ts";

/**
 * How participation appears in a timeline.
 *
 * @since 0.1.0
 */
export { ThreadParticipationTimeline } from "./ThreadParticipationTimeline.ts";

/**
 * The actions on a thread that need a grant: starting, reading, and renaming one.
 *
 * @since 0.1.0
 */
export { ThreadPermissions } from "./ThreadPermissions.ts";

/**
 * The projection that keeps the thread read model.
 *
 * @since 0.1.0
 */
export { ThreadProjection } from "./ThreadProjection.ts";

/**
 * The reads of threads that operations share.
 *
 * @since 0.1.0
 */
export { ThreadQuery } from "./ThreadQuery.ts";

/**
 * The operations on threads an actor calls: starting, renaming, and reading them.
 *
 * @since 0.1.0
 */
export { ThreadService } from "./ThreadService.ts";

/**
 * The storage contract for threads.
 *
 * @since 0.1.0
 */
export { ThreadStore } from "./ThreadStore.ts";

/**
 * The closed set of timeline items, for protocols that encode timelines.
 *
 * @since 0.1.0
 */
export { ThreadTimeline } from "./ThreadTimeline.ts";

/**
 * The kind of activity a thread's title records in its timeline.
 *
 * @since 0.1.0
 */
export { ThreadTitleActivity } from "./ThreadTitleActivity.ts";

/**
 * How a thread's title appears in a timeline.
 *
 * @since 0.1.0
 */
export { ThreadTitleTimeline } from "./ThreadTitleTimeline.ts";
