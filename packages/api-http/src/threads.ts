import { Group } from "@amends-dev/core/group";
import {
  Thread,
  ThreadActivityStore,
  ThreadMessage,
  ThreadParticipation,
  ThreadTimeline,
} from "@amends-dev/core/thread";
import { ReadState } from "@amends-dev/core/read-state";
import { Workspace } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";
import { limit } from "./paging.ts";

const thread = { workspaceId: Workspace.Id, threadId: Thread.Id };
const message = { workspaceId: Workspace.Id, messageId: ThreadMessage.Id };
const inGroup = { workspaceId: Workspace.Id, groupId: Group.Id };
const reply = Schema.Struct({
  text: ThreadMessage.PublishInput.fields.text,
  mentions: ThreadMessage.PublishInput.fields.mentions,
});
const opening = Schema.Struct({
  ...reply.fields,
  title: Thread.StartInGroupInput.fields.title,
  origin: Thread.StartInGroupInput.fields.origin,
  task: Thread.StartInGroupInput.fields.task,
});
const started = Thread.Started.pipe(HttpApiSchema.status(201)).annotate({
  identifier: "StartedThread",
});
const record = Thread.Record.annotate({ identifier: "Thread" });
const messageRecord = ThreadMessage.Record.annotate({ identifier: "Message" });
const participant = ThreadParticipation.Summary.annotate({ identifier: "ThreadParticipant" });
const reading = ThreadActivityStore.ReadOptions.fields;

/**
 * Conversations: a group's threads, starting them, as tasks or not, and renaming them, their
 * timelines and participants, replying, editing and deleting messages, saying one is typing,
 * following, and read positions.
 * Reading a thread requires current membership of its group and creates no participation; missing
 * and unreadable threads answer alike.
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
      payload: opening,
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
      success: record,
      error: [...ApiErrors.member, ...ApiErrors.thread],
    }),
    HttpApiEndpoint.post("rename", "/threads/:threadId/rename", {
      params: thread,
      payload: Schema.Struct({
        title: Thread.RenameInput.fields.title,
        expectedTitle: Thread.RenameInput.fields.expectedTitle,
      }),
      success: record,
      error: [...ApiErrors.member, ...ApiErrors.thread, ApiErrors.ThreadChanged],
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
      success: messageRecord.pipe(HttpApiSchema.status(201)),
      error: [...ApiErrors.member, ...ApiErrors.message],
    }),
    HttpApiEndpoint.put("edit", "/messages/:messageId", {
      params: message,
      payload: Schema.Struct({
        text: ThreadMessage.EditInput.fields.text,
        mentions: ThreadMessage.EditInput.fields.mentions,
        expectedRevision: ThreadMessage.EditInput.fields.expectedRevision,
      }),
      success: messageRecord,
      error: [...ApiErrors.member, ...ApiErrors.messageEdit],
    }),
    HttpApiEndpoint.delete("delete", "/messages/:messageId", {
      params: message,
      success: messageRecord,
      error: [...ApiErrors.member, ...ApiErrors.messageDelete],
    }),
    HttpApiEndpoint.post("typing", "/threads/:threadId/typing", {
      params: thread,
      success: HttpApiSchema.NoContent,
      error: [...ApiErrors.member, ...ApiErrors.typing],
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
