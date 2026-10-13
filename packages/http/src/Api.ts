/**
 * The whole HTTP contract: every endpoint group under one `HttpApi`, with the title its OpenAPI
 * document carries. The `XHandlers` modules register handlers for each group against it, typed
 * clients derive from it, and a running host serves its OpenAPI document at `/openapi.json`. A new
 * group is declared in its own module and added here.
 *
 * @since 0.1.0
 */
import * as HttpApi from "effect/http-api/HttpApi";
import * as OpenApi from "effect/http-api/OpenApi";
import { declareWorkspaceHeader } from "./internal/workspace-header.ts";
import * as AccountsGroup from "./AccountsGroup.ts";
import * as InvitationsGroup from "./InvitationsGroup.ts";
import * as AssignmentsGroup from "./AssignmentsGroup.ts";
import * as MeGroup from "./MeGroup.ts";
import * as MembersGroup from "./MembersGroup.ts";
import * as NotificationsGroup from "./NotificationsGroup.ts";
import * as SessionGroup from "./SessionGroup.ts";
import * as WorkspacesGroup from "./WorkspacesGroup.ts";
import * as SettingsGroup from "./SettingsGroup.ts";
import * as ChangeFeedGroup from "./ChangeFeedGroup.ts";
import * as AgentsGroup from "./AgentsGroup.ts";
import * as ChannelsGroup from "./ChannelsGroup.ts";
import * as ConnectionsGroup from "./ConnectionsGroup.ts";
import * as GroupsGroup from "./GroupsGroup.ts";
import * as TasksGroup from "./TasksGroup.ts";
import * as ThreadsGroup from "./ThreadsGroup.ts";
import * as TurnsGroup from "./TurnsGroup.ts";

/** Every endpoint group. */
const groups = HttpApi.make("amends")
  .add(SessionGroup.SessionGroup)
  .add(MeGroup.MeGroup)
  .add(AccountsGroup.AccountsGroup)
  .add(WorkspacesGroup.WorkspacesGroup)
  .add(SettingsGroup.SettingsGroup)
  .add(MembersGroup.MembersGroup)
  .add(InvitationsGroup.InvitationsGroup)
  .add(AssignmentsGroup.AssignmentsGroup)
  .add(GroupsGroup.GroupsGroup)
  .add(ThreadsGroup.ThreadsGroup)
  .add(TasksGroup.TasksGroup)
  .add(NotificationsGroup.NotificationsGroup)
  .add(ConnectionsGroup.ConnectionsGroup)
  .add(AgentsGroup.AgentsGroup)
  .add(TurnsGroup.TurnsGroup)
  .add(ChannelsGroup.ChannelsGroup)
  .add(ChannelsGroup.ChannelEventsGroup)
  .add(ChangeFeedGroup.ChangeFeedGroup);

/**
 * The public HTTP contract. Servers implement its groups; clients are generated from it. Its
 * OpenAPI document declares the `Amends-Workspace` header on every endpoint a member calls.
 *
 * @category models
 * @since 0.1.0
 */
export class Api extends groups.annotateMerge(
  OpenApi.annotations({ title: "Amends API", transform: declareWorkspaceHeader(groups) }),
) {}
