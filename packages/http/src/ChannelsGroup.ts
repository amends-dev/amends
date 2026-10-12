/**
 * The `channels` and `channelEvents` endpoint groups: a connection's external conversations as
 * threads in one group, and what their systems send. `ChannelsGroup` calls `ChannelService`:
 * `list`, `create`, `get`, `redirect`, `remove`, and `getBinding`, for active members, with
 * `channel.create` and `channel.manage` deciding who changes them. `ChannelEventsGroup` has no
 * principal: it hands each request to `ChannelIntake.receive`, whose transport verifies it as the
 * external system signed it. `ChannelsHandlers` implements both.
 *
 * @since 0.1.0
 */
import { Channel, ChannelBinding } from "@amends-dev/core/channel";
import { Group } from "@amends-dev/core/group";
import { Thread } from "@amends-dev/core/thread";
import { Workspace } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./Authentication.ts";
import { WorkspaceMember } from "./WorkspaceMember.ts";
import * as ApiErrors from "./ApiErrors.ts";

const workspace = { workspaceId: Workspace.Id };
const channel = { workspaceId: Workspace.Id, channelId: Channel.Id };
const thread = { workspaceId: Workspace.Id, threadId: Thread.Id };
const record = Channel.Channel.annotate({ identifier: "Channel" });
/** The body an external system sends, and the answer it is given, as text: the transport reads it. */
const text = Schema.String.pipe(HttpApiSchema.asText());

/**
 * Channels: a connection's external conversations, which become threads in one group, as tasks in
 * triage when the channel opens tasks. A member creates a channel over a connection they may use
 * into a group they belong to, lists and reads the channels they may read, redirects one's new
 * conversations to another group, or removes it. A thread that came through a channel has a
 * binding, the conversation it came from.
 *
 * @category models
 * @since 0.1.0
 */
export class ChannelsGroup extends HttpApiGroup.make("channels")
  .add(
    HttpApiEndpoint.get("list", "/channels", {
      params: workspace,
      success: Schema.Array(record),
      error: [...ApiErrors.workspace, ...ApiErrors.channelRead],
    }),
    HttpApiEndpoint.post("create", "/channels", {
      params: workspace,
      headers: ApiErrors.requestKey,
      payload: Channel.CreateInput,
      success: record.pipe(HttpApiSchema.status(201)),
      error: [...ApiErrors.workspace, ...ApiErrors.channelCreate],
    }),
    HttpApiEndpoint.get("get", "/channels/:channelId", {
      params: channel,
      success: record,
      error: [...ApiErrors.workspace, ...ApiErrors.channelRead],
    }),
    HttpApiEndpoint.post("redirect", "/channels/:channelId/redirect", {
      params: channel,
      payload: Schema.Struct({ groupId: Group.Id }),
      success: record,
      error: [...ApiErrors.workspace, ...ApiErrors.channelRead],
    }),
    HttpApiEndpoint.delete("remove", "/channels/:channelId", {
      params: channel,
      success: HttpApiSchema.NoContent,
      error: [...ApiErrors.workspace, ...ApiErrors.channelRead],
    }),
    HttpApiEndpoint.get("binding", "/threads/:threadId/channel", {
      params: thread,
      success: ChannelBinding.ChannelBinding.annotate({ identifier: "ChannelBinding" }),
      error: [...ApiErrors.workspace, ...ApiErrors.channelBinding],
    }),
  )
  .middleware(WorkspaceMember)
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId") {}

/**
 * What external systems send a channel. No session authenticates these requests: the channel's
 * transport verifies each as its system signs it, and rejects what it cannot. The answer is what
 * the transport says the system expects, or nothing.
 *
 * @category models
 * @since 0.1.0
 */
export class ChannelEventsGroup extends HttpApiGroup.make("channelEvents").add(
  HttpApiEndpoint.post("receive", "/workspaces/:workspaceId/channels/:channelId/events", {
    params: channel,
    payload: text,
    success: text,
    error: [...ApiErrors.workspace, ...ApiErrors.channelEvents],
  }),
) {}
