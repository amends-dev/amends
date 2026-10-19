/**
 * The workspace's agents, each with how ready it is and what it runs on, and, for a person who may
 * configure it, renaming it and changing how it is set up; and adding one, for a person who may,
 * on the harnesses, models, and sandboxes the workspace's connections give. An agent's role, and
 * its removal, are its membership's, in the settings. The workspace page lists the host's
 * integrations once and informs the Block of them, which say what each connection gives, and a
 * model connection lists its models over HTTP as the form chooses it.
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import { Grant, Role } from "@amends-dev/core/authorization"
import { Connection } from "@amends-dev/core/connection"
import { Identity } from "@amends-dev/core/identity"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import * as AgentSetup from "../../agentSetup.ts"
import { ConnectionItem, Integrations } from "../connections/definition.ts"
import { WorkspaceItem } from "../settings/definition.ts"

/** An agent of the workspace, and whether a change to it is on its way. Its name and role are its member's. */
export const AgentItem = Schema.Struct({ agent: ReplicaRecord.Agent, pending: Schema.Boolean })
export type AgentItem = typeof AgentItem.Type

/**
 * The form open among the agents: adding one, with its name, the role it starts with, and how it
 * is set up; changing how one is set up; or renaming one. A setup the person left wanting keeps why.
 */
export const Form = defineTaggedUnion({
  Adding: { name: Schema.String, roleId: Role.RoleId, setup: AgentSetup.Draft, error: Schema.Option(Schema.String) },
  Configuring: { agentId: Identity.AgentId, setup: AgentSetup.Draft, error: Schema.Option(Schema.String) },
  Renaming: { agentId: Identity.AgentId, name: Schema.String }
})
export type Form = typeof Form.Type

/** The models a connection offers, as the host lists them: loading, loaded, or not reached, with why. */
export const OfferedModels = defineTaggedUnion({
  Loading: { connectionId: ConnectionContract.ConnectionId },
  Loaded: { connectionId: ConnectionContract.ConnectionId, models: Connection.Models },
  Failed: { connectionId: ConnectionContract.ConnectionId, error: Schema.String }
})
export type OfferedModels = typeof OfferedModels.Type

/**
 * The workspace's agents and the members they are, the connections they run on and the
 * integrations that say what those give, the roles and the workspace that say which role a new
 * agent may start with, what the person may do, the form open among the agents, the models its
 * model connection offers, and why the last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  agents: Schema.Array(AgentItem),
  members: Schema.Array(Member.Member),
  connections: Schema.Array(ConnectionItem),
  integrations: Integrations,
  roles: Schema.Array(Role.Role),
  workspace: Schema.Option(WorkspaceItem),
  grants: Schema.Array(Grant.Grant),
  form: Schema.Option(Form),
  offered: Schema.Option(OfferedModels),
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedAgents: {
    agents: Schema.Array(AgentItem),
    members: Schema.Array(Member.Member),
    connections: Schema.Array(ConnectionItem),
    roles: Schema.Array(Role.Role),
    workspace: Schema.Option(WorkspaceItem),
    grants: Schema.Array(Grant.Grant)
  },
  ReceivedIntegrations: { integrations: Schema.Array(Connection.IntegrationView) },
  FailedLoadIntegrations: { error: Schema.String },
  FailedRead: { error: Schema.String },
  ClickedReloadIntegrations: {},
  ClickedAdd: {},
  TypedName: { name: Schema.String },
  ChoseRole: { roleId: Role.RoleId },
  TypedInstructions: { instructions: Schema.String },
  ChoseHarness: { harness: Schema.String },
  ChoseModelConnection: { connectionId: Schema.String },
  ChoseModel: { modelId: Schema.String },
  ChoseEffort: { effort: Schema.String },
  ChoseSandbox: { sandbox: Schema.String },
  SubmittedForm: {},
  ClickedCancelForm: {},
  ClickedRename: { agentId: Identity.AgentId },
  ClickedConfigure: { agentId: Identity.AgentId },
  ReceivedModels: { connectionId: ConnectionContract.ConnectionId, models: Connection.Models },
  FailedLoadModels: { connectionId: ConnectionContract.ConnectionId, error: Schema.String },
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

/** What the Block asks of the workspace page: to list the integrations again, once the host could not be reached. */
export const OutMessage = defineMessageUnion({ RequestedIntegrations: {} })
export type OutMessage = typeof OutMessage.Type

export const AgentsDefinition = Block.makeDefinition("Agents", { Model, Message, OutMessage })

/** The agent `agentId`, while the workspace has it. */
export const findAgent = (model: Pick<Model, "agents">, agentId: Identity.AgentId): Option.Option<AgentItem> =>
  Option.fromUndefinedOr(model.agents.find(({ agent }) => agent.id === agentId))

/** The agents whose membership is still in the workspace. */
export const listedAgents = (model: Pick<Model, "agents" | "members">): ReadonlyArray<AgentItem> =>
  model.agents.filter(({ agent }) =>
    model.members.some(({ id, status }) => id === agent.memberId && status === "active")
  )

/** The name of the agent `agentId`, its membership's. */
export const findAgentName = (
  model: Pick<Model, "agents" | "members">,
  agentId: Identity.AgentId
): Option.Option<string> =>
  Option.flatMap(findAgent(model, agentId), ({ agent }) =>
    Option.fromUndefinedOr(model.members.find(({ id }) => id === agent.memberId)?.name)
  )

/** What the connection `connectionId` is called, or that it is gone. */
export const connectionName = (model: Pick<Model, "connections">, connectionId: string): string =>
  model.connections.find(({ connection }) => connection.id === connectionId)?.connection.name ?? "a removed connection"
