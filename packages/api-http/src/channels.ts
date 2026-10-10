import { Channel, ChannelBinding } from "@amends/core/channel";
import { Group } from "@amends/core/group";
import { Thread } from "@amends/core/thread";
import { Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

const workspace = { workspaceId: Workspace.Id };
const channel = { workspaceId: Workspace.Id, channelId: Channel.Id };
const thread = { workspaceId: Workspace.Id, threadId: Thread.Id };
const record = Channel.Record.annotate({ identifier: "Channel" });
/** The body an external system sends, and the answer it is given, as text: the transport reads it. */
const text = Schema.String.pipe(HttpApiSchema.asText());

/**
 * Channels: a connection's external conversations, which become threads in one group, as tasks in
 * triage when the channel opens tasks. A member creates a channel over a connection they may use
 * into a group they belong to, lists and reads the channels they may read, redirects one's new
 * conversations to another group, or removes it. A thread that came through a channel has a
 * binding, the conversation it came from.
 */
export class ChannelsGroup extends HttpApiGroup.make("channels")
  .add(
    HttpApiEndpoint.get("list", "/channels", {
      params: workspace,
      success: Schema.Array(record),
      error: [...ApiErrors.member, ...ApiErrors.channelRead],
    }),
    HttpApiEndpoint.post("create", "/channels", {
      params: workspace,
      headers: ApiErrors.requestKey,
      payload: Channel.CreateInput,
      success: record.pipe(HttpApiSchema.status(201)),
      error: [...ApiErrors.member, ...ApiErrors.channelCreate],
    }),
    HttpApiEndpoint.get("get", "/channels/:channelId", {
      params: channel,
      success: record,
      error: [...ApiErrors.member, ...ApiErrors.channelRead],
    }),
    HttpApiEndpoint.post("redirect", "/channels/:channelId/redirect", {
      params: channel,
      payload: Schema.Struct({ groupId: Group.Id }),
      success: record,
      error: [...ApiErrors.member, ...ApiErrors.channelRedirect],
    }),
    HttpApiEndpoint.delete("remove", "/channels/:channelId", {
      params: channel,
      success: HttpApiSchema.NoContent,
      error: [...ApiErrors.member, ...ApiErrors.channelRead],
    }),
    HttpApiEndpoint.get("binding", "/threads/:threadId/channel", {
      params: thread,
      success: ChannelBinding.Record.annotate({ identifier: "ChannelBinding" }),
      error: [...ApiErrors.member, ...ApiErrors.channelBinding],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId") {}

/**
 * What external systems send a channel. No session authenticates these requests: the channel's
 * transport verifies each as its system signs it, and rejects what it cannot. The answer is what
 * the transport says the system expects, or nothing.
 */
export class ChannelEventsGroup extends HttpApiGroup.make("channelEvents").add(
  HttpApiEndpoint.post("receive", "/workspaces/:workspaceId/channels/:channelId/events", {
    params: channel,
    payload: text,
    success: text,
    error: [ApiErrors.WorkspaceNotFound, ...ApiErrors.workspace, ...ApiErrors.channelEvents],
  }),
) {}
