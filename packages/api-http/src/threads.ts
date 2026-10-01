import { Group } from "@amends/core/group";
import {
  Thread,
  ThreadActivityStore,
  ThreadMessage,
  ThreadParticipation,
  ThreadTimeline,
} from "@amends/core/thread";
import { ReadState } from "@amends/core/read-state";
import { Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";
import { limit } from "./paging.ts";

const thread = { workspaceId: Workspace.Id, threadId: Thread.Id };
const inGroup = { workspaceId: Workspace.Id, groupId: Group.Id };
const reply = Schema.Struct({
  text: ThreadMessage.PublishInput.fields.text,
  mentions: ThreadMessage.PublishInput.fields.mentions,
});
const started = Thread.Started.pipe(HttpApiSchema.status(201)).annotate({
  identifier: "StartedThread",
});
const participant = ThreadParticipation.Summary.annotate({ identifier: "ThreadParticipant" });
const reading = ThreadActivityStore.ReadOptions.fields;

/**
 * Conversations: a group's threads, starting them, their timelines and participants, replying,
 * following, and read positions. Reading a thread requires current membership of its group and
 * creates no participation; missing and unreadable threads answer alike.
 */
export class ThreadsGroup extends HttpApiGroup.make("threads")
  .add(
    HttpApiEndpoint.get("list", "/groups/:groupId/threads", {
      params: inGroup,
      query: {
        limit,
        before: Schema.optionalKey(Schema.fromJsonString(Thread.ListCursor)).annotate({
          description:
            "Exclusive boundary as JSON containing the last item's latestActivityAt (UTC ISO string) and threadId.",
        }),
      },
      success: Schema.Array(Thread.ListItem.annotate({ identifier: "ThreadListItem" })),
      error: [...ApiErrors.member, ...ApiErrors.thread],
    }),
    HttpApiEndpoint.get("openings", "/groups/:groupId/openings", {
      params: inGroup,
      query: {
        limit,
        before: Schema.optionalKey(Schema.fromJsonString(Thread.OpeningCursor)).annotate({
          description:
            "Exclusive boundary as JSON containing the last item's thread createdAt (UTC ISO string) and threadId.",
        }),
      },
      success: Schema.Array(Thread.Opening.annotate({ identifier: "ThreadOpening" })),
      error: [...ApiErrors.member, ...ApiErrors.thread],
    }),
    HttpApiEndpoint.post("start", "/groups/:groupId/threads", {
      params: inGroup,
      headers: ApiErrors.requestKey,
      payload: reply,
      success: started,
      error: [...ApiErrors.member, ...ApiErrors.thread],
    }),
    HttpApiEndpoint.post("startDirect", "/threads", {
      params: { workspaceId: Workspace.Id },
      headers: ApiErrors.requestKey,
      payload: Thread.StartDirectInput,
      success: started,
      error: [...ApiErrors.member, ...ApiErrors.thread],
    }),
    HttpApiEndpoint.get("get", "/threads/:threadId", {
      params: thread,
      success: Thread.Record.annotate({ identifier: "Thread" }),
      error: [...ApiErrors.member, ...ApiErrors.thread],
    }),
    HttpApiEndpoint.get("timeline", "/threads/:threadId/timeline", {
      params: thread,
      query: {
        limit,
        afterSequence: reading.afterSequence,
        beforeSequence: reading.beforeSequence,
        from: reading.from,
      },
      success: Schema.Array(ThreadTimeline.Item.annotate({ identifier: "TimelineItem" })),
      error: [...ApiErrors.member, ...ApiErrors.thread],
    }),
    HttpApiEndpoint.get("participants", "/threads/:threadId/participants", {
      params: thread,
      query: {
        limit,
        after: Schema.optionalKey(ThreadParticipation.Id).annotate({
          description: "Exclusive boundary: the last participation ID of the previous page.",
        }),
      },
      success: Schema.Array(participant),
      error: [...ApiErrors.member, ...ApiErrors.thread],
    }),
    HttpApiEndpoint.post("publish", "/threads/:threadId/messages", {
      params: thread,
      headers: ApiErrors.requestKey,
      payload: reply,
      success: ThreadMessage.Record.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "PublishedMessage",
      }),
      error: [...ApiErrors.member, ...ApiErrors.message],
    }),
    HttpApiEndpoint.post("follow", "/threads/:threadId/follow", {
      params: thread,
      success: participant,
      error: [...ApiErrors.member, ...ApiErrors.participation],
    }),
    HttpApiEndpoint.post("unfollow", "/threads/:threadId/unfollow", {
      params: thread,
      payload: Schema.Struct({
        participationId: ThreadParticipation.UnfollowInput.fields.participationId,
      }),
      success: HttpApiSchema.NoContent,
      error: [...ApiErrors.member, ...ApiErrors.participation],
    }),
    HttpApiEndpoint.post("markRead", "/threads/:threadId/read", {
      params: thread,
      payload: Schema.Struct({
        throughSequence: ReadState.MarkThreadReadInput.fields.throughSequence,
      }),
      success: HttpApiSchema.NoContent,
      error: [...ApiErrors.member, ...ApiErrors.readState],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId") {}
