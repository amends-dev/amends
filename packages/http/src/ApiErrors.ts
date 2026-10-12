/**
 * The contract's error namespace: each gateway and core outcome an endpoint can answer with, given
 * its HTTP status, and the lists of them that groups spread into an endpoint's `error`. Core
 * declares no transport concerns, so the status lives here, on the contract's view of each error,
 * and the serialized tag stays the one core or the gateway declares. `TooManyStreams` is the
 * contract's own, and `requestKey` is the `Idempotency-Key` header a creating endpoint accepts.
 *
 * @since 0.1.0
 */
import * as GatewayErrors from "@amends-dev/gateway/GatewayErrors";
import { Request } from "@amends-dev/core/request";
import { Schema } from "effect";
import { HttpApiSchema } from "effect/http-api";
import { CoreError } from "@amends-dev/core/error";

/**
 * The caller cannot open another live-update stream on this server now: the workspace, or the
 * caller within it, already has as many as it may. Retry after closing one.
 *
 * @category errors
 * @since 0.1.0
 */
export class TooManyStreams extends Schema.TaggedError<TooManyStreams>()(
  "ApiErrors.TooManyStreams",
  { limit: Schema.Literals(["workspace", "member"]) },
  { httpApiStatus: 429 },
) {}

/**
 * Something the caller named is missing, or out of their reach, which answer alike: 404, with the
 * resource and the ID.
 *
 * @category errors
 * @since 0.1.0
 */
export const NotFound = CoreError.NotFound.pipe(HttpApiSchema.status(404));
/**
 * What the caller expected of a resource, such as its name, title, revision, or roles, changed
 * since they read it, and nothing was recorded: 409, with the resource and the ID.
 *
 * @category errors
 * @since 0.1.0
 */
export const Changed = CoreError.Changed.pipe(HttpApiSchema.status(409));
/**
 * The caller may not do what they asked, for the `reason` given, such as a grant they lack, a
 * workspace they are not a member of, or an action only a person or the owner takes: 403.
 *
 * @category errors
 * @since 0.1.0
 */
export const Denied = CoreError.Denied.pipe(HttpApiSchema.status(403));
/**
 * The state of what the caller acts on refuses the request, for the `reason` given, such as a
 * member already in the group, a turn that already finished, or an invitation no longer open: 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const Conflict = CoreError.Conflict.pipe(HttpApiSchema.status(409));
/**
 * The request cannot be done as asked, whatever the state, for the `reason` given, such as values
 * that do not hold, a fixed roster, or an agent setup that cannot run: 422.
 *
 * @category errors
 * @since 0.1.0
 */
export const Invalid = CoreError.Invalid.pipe(HttpApiSchema.status(422));
/**
 * What the operation needs cannot be reached or used now, for the `reason` given, such as storage
 * another writer held or a host that keeps no keys: 503.
 *
 * @category errors
 * @since 0.1.0
 */
export const Unavailable = CoreError.Unavailable.pipe(HttpApiSchema.status(503));
/**
 * The request key a creating endpoint accepts: send a new one for each logical request and the
 * same one on every retry of it, and the retry returns the first attempt's result.
 *
 * @category schemas
 * @since 0.1.0
 */
export const requestKey = {
  "idempotency-key": Schema.optionalKey(Request.Key),
};
/**
 * The commit's outcome is unknown, so the client reconciles what is stored before repeating it;
 * 500, with the commit's ID.
 *
 * @category errors
 * @since 0.1.0
 */
export const Uncertain = GatewayErrors.Uncertain.pipe(HttpApiSchema.status(500));
/**
 * The delegation rules' outcomes, which giving, changing, and taking away a role share, as do
 * issuing and answering an invitation and reading a member's access: `Denied` where only the owner
 * may (403); a missing member, invitation, or built-in role this workspace does not record (404);
 * the owner out of reach, a member no longer active or already one, or an invitation no longer open
 * (409); and a role other than the three built-in ones, or an expiry not after now (422).
 *
 * @category errors
 * @since 0.1.0
 */
export const delegation = [Denied, Conflict, Invalid, NotFound] as const;
/**
 * Assignment outcomes: the delegation rules', and access that changed since the caller read it,
 * 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const assignment = [...delegation, Changed] as const;

/**
 * Ownership outcomes: a caller who is not the owner is 403, a missing recipient 404, and a
 * recipient who cannot own the workspace, or an Owner assignment that moved since the caller read
 * it, 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const ownership = [Denied, NotFound, Conflict, Changed] as const;

/**
 * Group outcomes. A group the caller does not belong to is indistinguishable from a missing one,
 * and both are 404, as is a missing member named for a new team; a named member no longer active
 * is a 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const group = [NotFound, Conflict] as const;
/**
 * Admission outcomes: a missing group, member, or admission is 404; a member no longer active, one
 * admitted already, and an admission ended already are 409; the fixed roster of a direct or the
 * general group is 422.
 *
 * @category errors
 * @since 0.1.0
 */
export const groupMembership = [NotFound, Conflict, Invalid] as const;
/**
 * Following outcomes: a missing group, or one the caller does not belong to, is 404; making someone
 * other than an agent follow is 403; a member missing, inactive, or outside the group is 409;
 * and a direct group, whose members already take part in every thread, is 422.
 *
 * @category errors
 * @since 0.1.0
 */
export const groupFollow = [NotFound, Denied, Conflict, Invalid] as const;

/**
 * Thread outcomes. Missing threads and threads outside the caller's groups share a 404; an agent
 * principal writing where only people may is a 403; a named member who cannot take part is a 409;
 * and a direct thread without another member is a 422.
 *
 * @category errors
 * @since 0.1.0
 */
export const thread = [NotFound, Denied, Conflict, Invalid] as const;
/**
 * Replying outcomes: a thread missing or outside the caller's groups is 404, an agent principal
 * 403, and a mentioned member who cannot take part 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const message = [NotFound, Denied, Conflict] as const;
/**
 * Editing a message: a missing one, or one in a thread outside the caller's groups, is 404; one
 * someone else wrote is 403; a deleted one, a stale revision, and an unavailable mention are 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const messageEdit = [NotFound, Denied, Conflict, Changed] as const;
/**
 * Deleting a message: a missing or unreadable one is 404; an agent principal is 403.
 *
 * @category errors
 * @since 0.1.0
 */
export const messageDelete = [NotFound, Denied] as const;
/**
 * Saying one is typing: a thread missing or outside the caller's groups is 404.
 *
 * @category errors
 * @since 0.1.0
 */
export const typing = [NotFound] as const;
/**
 * Following a thread: a missing thread, or a participation missing or not the caller's, is 404; a
 * participation ended already is 409; and a direct conversation, where everyone takes part, 422.
 *
 * @category errors
 * @since 0.1.0
 */
export const participation = [NotFound, Conflict, Invalid] as const;

/**
 * Task outcomes. A thread the caller cannot read, or without a task, is 404, as is a group the
 * caller does not belong to; a thread that is a task already, a change to a value that changed
 * meanwhile, and an assignee who cannot take part are 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const taskRead = [NotFound] as const;
/**
 * Making a conversation a task: a missing or unreadable thread is 404; a thread that is a task
 * already, and an assignee who cannot take part, are 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const taskCreate = [NotFound, Conflict] as const;
/**
 * Changing a task: a thread missing, unreadable, or without a task is 404; a value that changed
 * meanwhile, and an assignee who cannot take part, are 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const taskUpdate = [NotFound, Changed, Conflict] as const;

/**
 * Read-state outcomes: only people keep it, and a position cannot pass the latest activity.
 *
 * @category errors
 * @since 0.1.0
 */
export const readState = [Denied, NotFound, Conflict] as const;

/**
 * Outcomes every operation in a workspace shares: authorization, input, and storage.
 *
 * @category errors
 * @since 0.1.0
 */
export const workspace = [Denied, Invalid, Unavailable, Uncertain] as const;

/**
 * Channel outcomes. A channel the caller may not read, or removed, is 404, as is a group the caller
 * does not belong to and a thread bound to no conversation; a connection that gives no channels, or
 * that the caller may not use, is 422.
 *
 * @category errors
 * @since 0.1.0
 */
export const channelRead = [NotFound] as const;
/**
 * Creating a channel: a group the caller does not belong to is 404, and a connection that gives no
 * channels, or that the caller may not use, is 422.
 *
 * @category errors
 * @since 0.1.0
 */
export const channelCreate = [...channelRead, Invalid] as const;
/**
 * Where a thread came from: a thread missing, unreadable, or that came through no channel is 404.
 *
 * @category errors
 * @since 0.1.0
 */
export const channelBinding = [NotFound] as const;
/**
 * What an external system's request to a channel can be answered with: a channel missing or removed
 * is 404, a request its transport rejects 422, and a system that cannot be reached 503.
 *
 * @category errors
 * @since 0.1.0
 */
export const channelEvents = [NotFound, Invalid, Unavailable] as const;
