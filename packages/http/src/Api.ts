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
import { AccountsGroup } from "./AccountsGroup.ts";
import { InvitationsGroup } from "./InvitationsGroup.ts";
import { AssignmentsGroup } from "./AssignmentsGroup.ts";
import { MeGroup } from "./MeGroup.ts";
import { MembersGroup } from "./MembersGroup.ts";
import { NotificationsGroup } from "./NotificationsGroup.ts";
import { SessionGroup } from "./SessionGroup.ts";
import { WorkspacesGroup } from "./WorkspacesGroup.ts";
import { SettingsGroup } from "./SettingsGroup.ts";
import { ChangeFeedGroup } from "./ChangeFeedGroup.ts";
import { AgentsGroup } from "./AgentsGroup.ts";
import { ChannelEventsGroup, ChannelsGroup } from "./ChannelsGroup.ts";
import { ConnectionsGroup } from "./ConnectionsGroup.ts";
import { GroupsGroup } from "./GroupsGroup.ts";
import { TasksGroup } from "./TasksGroup.ts";
import { ThreadsGroup } from "./ThreadsGroup.ts";
import { TurnsGroup } from "./TurnsGroup.ts";

/** Every endpoint group. */
const groups = HttpApi.make("amends")
  .add(SessionGroup)
  .add(MeGroup)
  .add(AccountsGroup)
  .add(WorkspacesGroup)
  .add(SettingsGroup)
  .add(MembersGroup)
  .add(InvitationsGroup)
  .add(AssignmentsGroup)
  .add(GroupsGroup)
  .add(ThreadsGroup)
  .add(TasksGroup)
  .add(NotificationsGroup)
  .add(ConnectionsGroup)
  .add(AgentsGroup)
  .add(TurnsGroup)
  .add(ChannelsGroup)
  .add(ChannelEventsGroup)
  .add(ChangeFeedGroup);

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
