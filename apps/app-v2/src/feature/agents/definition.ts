/**
 * The workspace's agents, as a section of the sidebar to pick one from, each by its name with how it stands and what
 * it is doing; as a list page, All and those that need setup on a tab each, narrowed by a search, each with its harness
 * and sandbox, its model and connection, and where it is at work; as the page of one, where, for a person who may
 * configure it, they rename it and set it up again, and see why it can't run and what it is doing, and, for a person
 * who may remove members, remove it; and adding one, for a person who may, on the harnesses, models, and sandboxes the
 * workspace's connections give. Adding and removing happen in a dialog the workspace page lends the shell. The Block
 * reports when the person asks to browse, the agent they pick, and what they did, which the workspace page shows the
 * list or the agent's page for, and confirms. An agent's role is its membership's, in the settings. The workspace page
 * lists the host's integrations once and informs the Block of them, which say what each connection gives, and a model
 * connection lists its models over HTTP as a setup chooses it. What an agent is doing is read from the turns the store
 * holds (see `agentActivity.ts`).
 */

import { Connection as ConnectionContract, type Integration } from "@amends-dev/connection"
import { Agent, AgentPermissions } from "@amends-dev/core/agent"
import { BuiltinRoles, Grant, Role } from "@amends-dev/core/authorization"
import { Connection } from "@amends-dev/core/connection"
import { Group } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Member, MemberId, MemberPermissions, WorkspaceId } from "@amends-dev/core/workspace"
import type { Choice } from "@amends-dev/design/control"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { activityOf, type AgentActivity, turnsUnderWay } from "../../agentActivity.ts"
import * as AgentSetup from "../../agentSetup.ts"
import { may, memberTarget, workspaceTarget } from "../../permissions.ts"
import { foldAccents } from "../../seen.ts"
import { ConnectionItem, connectionItemsGiving, findIntegration, Integrations } from "../connections/definition.ts"
import { givableRoles, WorkspaceItem } from "../settings/definition.ts"

/** An agent of the workspace, and whether a change to it is on its way. Its name and role are its member's. */
export const AgentItem = Schema.Struct({ agent: ReplicaRecord.Agent, pending: Schema.Boolean })
export type AgentItem = typeof AgentItem.Type

/** What the person asks of the agents: adding one, renaming one, setting one up again, and removing one. */
export const AgentAction = Schema.Literals(["Create", "Rename", "Configure", "Remove"])
export type AgentAction = typeof AgentAction.Type

/**
 * Why a change could not be made: what the person entered does not decode (`Invalid`), a setup has parts that
 * can't be saved as they are, each marked beside its field (`Incomplete`), or this browser could not keep the
 * action (`Unwritable`). What the server refuses afterwards comes back as a toast, from the actions.
 */
export const Reason = defineTaggedUnion({
  Invalid: {},
  Incomplete: { problems: Schema.Array(AgentSetup.Problem) },
  Unwritable: {}
})
export type Reason = typeof Reason.Type

/** A change that could not be made, and why. */
export const Failure = Schema.Struct({ action: AgentAction, reason: Reason })
export type Failure = typeof Failure.Type

/**
 * An action of the agents that was written to the store, or could not be: which, with what the update needs to
 * finish it.
 */
export const Written = defineTaggedUnion({
  Create: { name: Schema.String },
  Rename: { agentId: Identity.AgentId },
  Configure: { agentId: Identity.AgentId },
  Remove: { agentId: Identity.AgentId }
})
export type Written = typeof Written.Type

/**
 * An agent being added, once its form is sent: the name it was sent under and which agents the workspace had
 * then, so that the one the store makes is told from the others, and whether the store has kept the action. The
 * dialog stays on it until the new agent is listed.
 */
export const Creating = Schema.Struct({
  name: Schema.String,
  knownAgentIds: Schema.Array(Identity.AgentId),
  isWritten: Schema.Boolean
})
export type Creating = typeof Creating.Type

/**
 * The form that adds an agent, in the dialog: the name it starts with, the role it starts with, how it is set up,
 * why the last attempt to add it failed, and, while one is on its way, that attempt.
 */
export const Adding = Schema.Struct({
  name: Schema.String,
  roleId: Role.RoleId,
  setup: AgentSetup.Draft,
  failure: Schema.Option(Failure),
  creating: Schema.Option(Creating)
})
export type Adding = typeof Adding.Type

/**
 * The confirmation, in the dialog, that removes an agent: which, by the name it had when the person asked, since
 * its membership leaving the workspace takes its name from the list; whether the request is on its way; and why the
 * last one failed.
 */
export const Removing = Schema.Struct({
  agentId: Identity.AgentId,
  name: Schema.String,
  isSending: Schema.Boolean,
  failure: Schema.Option(Failure)
})
export type Removing = typeof Removing.Type

/**
 * What the person has changed on an agent's page and not saved: the name they typed, the setup they edited, the
 * save on its way, and why the last save failed. The page shows the agent as it is saved wherever they changed
 * nothing.
 */
export const Edit = Schema.Struct({
  agentId: Identity.AgentId,
  name: Schema.Option(Schema.String),
  setup: Schema.Option(AgentSetup.Draft),
  saving: Schema.Option(AgentAction),
  failure: Schema.Option(Failure)
})
export type Edit = typeof Edit.Type

/** Which setup a change to one of its fields is for: the one the form that adds an agent holds, or an agent's own. */
export const SetupTarget = defineTaggedUnion({ Adding: {}, Agent: { agentId: Identity.AgentId } })
export type SetupTarget = typeof SetupTarget.Type

/** The models a connection offers, as the host lists them: loading, loaded, or not reached, with why. */
export const OfferedModels = defineTaggedUnion({
  Loading: { connectionId: ConnectionContract.ConnectionId },
  Loaded: { connectionId: ConnectionContract.ConnectionId, models: Connection.Models },
  Failed: { connectionId: ConnectionContract.ConnectionId, error: Schema.String }
})
export type OfferedModels = typeof OfferedModels.Type

/** Which agents the list page shows: every one, or those that need setup before they can run. */
export const BrowseTab = Schema.Literals(["All", "NeedsSetup"])
export type BrowseTab = typeof BrowseTab.Type

/**
 * The workspace's agents, once they are read, and the members they are, the connections they run on and the
 * integrations that say what those give, the roles and the workspace that say which role a new
 * agent may start with, what the person may do, the turns under way and the groups that name where, the list
 * page's tab and search, the dialog and what it is for, adding an agent or confirming one's removal, what they
 * changed on the agents' pages, the models the connections offer, how many times the person asked to read them
 * again, and why the last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  isLoaded: Schema.Boolean,
  agents: Schema.Array(AgentItem),
  members: Schema.Array(Member.Member),
  connections: Schema.Array(ConnectionItem),
  integrations: Integrations,
  roles: Schema.Array(Role.Role),
  workspace: Schema.Option(WorkspaceItem),
  grants: Schema.Array(Grant.Grant),
  turns: Schema.Array(ReplicaRecord.Turn),
  groups: Schema.Array(Group.Group),
  browse: Schema.Struct({ tab: BrowseTab, query: Schema.String }),
  dialog: DialogBlock.Model,
  adding: Schema.Option(Adding),
  removing: Schema.Option(Removing),
  edits: Schema.Array(Edit),
  offered: Schema.Array(OfferedModels),
  reads: Schema.Int,
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
  ReceivedActivity: { turns: Schema.Array(ReplicaRecord.Turn), groups: Schema.Array(Group.Group) },
  ReceivedIntegrations: { integrations: Schema.Array(Connection.IntegrationView) },
  FailedLoadIntegrations: { error: Schema.String },
  FailedRead: { error: Schema.String },
  ClickedTryAgain: {},
  ClickedReloadIntegrations: {},
  ClickedBrowse: {},
  ChoseBrowseTab: { tab: BrowseTab },
  TypedBrowseQuery: { query: Schema.String },
  ClickedAgent: { agentId: Identity.AgentId },
  ClickedAdd: {},
  TypedAddingName: { name: Schema.String },
  ChoseRole: { roleId: Role.RoleId },
  SubmittedAdding: {},
  ClickedRemove: { agentId: Identity.AgentId },
  ConfirmedRemoval: {},
  TypedName: { agentId: Identity.AgentId, name: Schema.String },
  SubmittedName: { agentId: Identity.AgentId },
  SubmittedSetup: { agentId: Identity.AgentId },
  ClickedDiscardSetup: { agentId: Identity.AgentId },
  TypedInstructions: { target: SetupTarget, instructions: Schema.String },
  ChoseHarness: { target: SetupTarget, harness: Schema.String },
  ChoseModelConnection: { target: SetupTarget, connectionId: Schema.String },
  ChoseModel: { target: SetupTarget, modelId: Schema.String },
  ChoseEffort: { target: SetupTarget, effort: Schema.String },
  ChoseSandbox: { target: SetupTarget, sandbox: Schema.String },
  ReceivedModels: { connectionId: ConnectionContract.ConnectionId, models: Connection.Models },
  FailedLoadModels: { connectionId: ConnectionContract.ConnectionId, error: Schema.String },
  WroteAction: { written: Written },
  FailedWriteAction: { written: Written, reason: Reason }
})
export type Message = typeof Message.Type

/**
 * What the Block asks of the workspace page: to list the integrations again, once the host could not be reached;
 * to show the agents, which the sidebar's title and Browse ask; to open the agent picked; and to confirm to the
 * person what they did, with the page of the agent that was added opening and the list showing once one is removed.
 */
export const OutMessage = defineMessageUnion({
  RequestedIntegrations: {},
  RequestedBrowse: {},
  OpenedAgent: { agentId: Identity.AgentId },
  SavedName: {},
  SavedSetup: {},
  CreatedAgent: { agentId: Identity.AgentId, name: Schema.String },
  RemovedAgent: { name: Schema.String }
})
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

/** The agent `agentId`, while the workspace lists it: it has the agent and its membership is still in it. */
export const findListedAgent = (
  model: Pick<Model, "agents" | "members">,
  agentId: Identity.AgentId
): Option.Option<AgentItem> => Option.fromUndefinedOr(listedAgents(model).find(({ agent }) => agent.id === agentId))

/** The name of the agent `agentId`, its membership's. */
export const findAgentName = (
  model: Pick<Model, "agents" | "members">,
  agentId: Identity.AgentId
): Option.Option<string> =>
  Option.flatMap(findAgent(model, agentId), ({ agent }) =>
    Option.fromUndefinedOr(model.members.find(({ id }) => id === agent.memberId)?.name)
  )

/** What the connection `connectionId` is called, or "Removed connection" once it is gone. */
export const connectionName = (model: Pick<Model, "connections">, connectionId: string): string =>
  model.connections.find(({ connection }) => connection.id === connectionId)?.connection.name ?? "Removed connection"

/** Whether the person may rename the agent and change how it is set up. */
export const mayConfigure = (model: Pick<Model, "workspaceId" | "grants">, agent: AgentItem["agent"]): boolean =>
  may(model.grants, AgentPermissions.Configure, memberTarget(model.workspaceId, agent.memberId))

/** Whether the person may remove the agent, which ends its membership. */
export const mayRemove = (model: Pick<Model, "workspaceId" | "grants">, agent: AgentItem["agent"]): boolean =>
  may(model.grants, MemberPermissions.Remove, memberTarget(model.workspaceId, agent.memberId))

/** Whether the host has listed its integrations, which say what each connection gives. */
const areIntegrationsListed = (model: Pick<Model, "integrations">): boolean =>
  Integrations.isAnyOf(["Loaded"])(model.integrations)

/** Whether the person may create agents. */
export const mayCreate = (model: Pick<Model, "workspaceId" | "grants">): boolean =>
  may(model.grants, AgentPermissions.Create, workspaceTarget(model.workspaceId))

/**
 * Whether the person may add an agent now: they may create agents and the integrations are listed, so the dialog
 * knows what each connection gives. With no connection that gives models, the dialog says so beside the field.
 */
export const mayAdd = (model: Pick<Model, "workspaceId" | "grants" | "integrations">): boolean =>
  mayCreate(model) && areIntegrationsListed(model)

/**
 * The turns of the agent that are under way, the most pressing first, each in the group it is in as the person names
 * it. An agent still on its way has none.
 */
export const turnsOfAgent = (
  model: Pick<Model, "turns" | "groups" | "members" | "memberId">,
  { agent, pending }: AgentItem
) => (pending ? [] : turnsUnderWay(agent.id, model.turns, model.groups, model.members, model.memberId))

/** What the agent is doing, from its turns under way: nothing while it is idle. */
export const activityOfAgent = (
  model: Pick<Model, "turns" | "groups" | "members" | "memberId">,
  item: AgentItem
): Option.Option<AgentActivity> => activityOf(turnsOfAgent(model, item))

/** The name of the agent, its membership's, or "An agent" while the members are not read. */
export const nameOfAgent = (model: Pick<Model, "members">, agent: AgentItem["agent"]): string =>
  model.members.find(({ id }) => id === agent.memberId)?.name ?? "An agent"

/** Whether the agent cannot run as it is set up, once the server has told how ready it is: not while it is on its way. */
export const needsSetup = ({ agent, pending }: AgentItem): boolean =>
  !pending && Agent.Readiness.isAnyOf(["Incomplete"])(agent.readiness)

/** The agents the list page shows: those the workspace lists, on the tab, whose name contains the search in any case and whatever the accents. */
export const shownAgents = (model: Pick<Model, "agents" | "members" | "browse">): ReadonlyArray<AgentItem> => {
  const { tab, query } = model.browse
  const wanted = foldAccents(query.trim())

  return listedAgents(model).filter(
    (item) => (tab === "All" || needsSetup(item)) && foldAccents(nameOfAgent(model, item.agent)).includes(wanted)
  )
}

/** What the person has changed on the page of `agentId`, if anything. */
export const findEdit = (model: Pick<Model, "edits">, agentId: Identity.AgentId): Option.Option<Edit> =>
  Option.fromUndefinedOr(model.edits.find((edit) => edit.agentId === agentId))

/** The name in the field of the agent's page: what the person typed, or the name it has. */
export const nameDraftOf = (model: Pick<Model, "edits" | "members">, { agent }: AgentItem): string =>
  Option.getOrElse(
    Option.flatMap(findEdit(model, agent.id), (edit) => edit.name),
    () => model.members.find(({ id }) => id === agent.memberId)?.name ?? ""
  )

/** The setup in the fields of the agent's page: what the person edited, or the setup it has. */
export const setupDraftOf = (model: Pick<Model, "edits">, { agent }: AgentItem): AgentSetup.Draft =>
  Option.getOrElse(
    Option.flatMap(findEdit(model, agent.id), (edit) => edit.setup),
    () => AgentSetup.draftOf(agent)
  )

/** Whether the name the person typed on the agent's page is one to save: not blank, and not the name it has. */
export const isNameChanged = (model: Pick<Model, "edits" | "members">, item: AgentItem): boolean => {
  const typed = nameDraftOf(model, item).trim()
  return typed !== "" && typed !== nameOfAgent(model, item.agent)
}

/** Whether the setup the person edited on the agent's page differs from the setup it has. */
export const isSetupChanged = (model: Pick<Model, "edits">, item: AgentItem): boolean =>
  !AgentSetup.isSameSetup(setupDraftOf(model, item), AgentSetup.draftOf(item.agent))

/** The models `connectionId` offers, as the host last listed them for a form, while one asked. */
export const offeredBy = (model: Pick<Model, "offered">, connectionId: string): Option.Option<OfferedModels> =>
  Option.fromUndefinedOr(model.offered.find((offered) => offered.connectionId === connectionId))

/** The models the connection of `setup` offers, once the host has listed them. */
const listedModels = (model: Pick<Model, "offered">, setup: AgentSetup.Draft): Option.Option<Connection.Models> =>
  Option.flatMap(offeredBy(model, setup.modelConnectionId), (offered) =>
    OfferedModels.matchOrElse(offered, { Loaded: ({ models }) => Option.some(models) }, () => Option.none())
  )

/** The model of `setup` among those its connection lists, while it is one. */
export const listedModelOf = (model: Pick<Model, "offered">, setup: AgentSetup.Draft) =>
  Option.flatMapNullishOr(listedModels(model, setup), ({ listed }) =>
    listed.find(({ id }) => id === setup.modelId.trim())
  )

/** Why the model of `setup` can't be used: its connection lists only the models it offers, and it is not one. */
export const modelProblem = (model: Pick<Model, "offered">, setup: AgentSetup.Draft): Option.Option<string> =>
  Option.isSome(listedModels(model, setup)) &&
  Option.exists(listedModels(model, setup), ({ unlisted }) => !unlisted) &&
  setup.modelId.trim() !== "" &&
  Option.isNone(listedModelOf(model, setup))
    ? Option.some("This connection offers only the models it lists.")
    : Option.none()

/** The connection `connectionId` among the workspace's, while it is one. */
const connectionOf = (model: Pick<Model, "connections">, connectionId: string): Option.Option<ConnectionItem> =>
  Option.fromUndefinedOr(model.connections.find(({ connection }) => connection.id === connectionId))

/** Why `setup` can't have no sandbox: the harness it names works only in one. */
export const sandboxProblem = (
  model: Pick<Model, "connections" | "integrations">,
  setup: AgentSetup.Draft
): Option.Option<string> =>
  setup.harness === "" || setup.sandbox !== ""
    ? Option.none()
    : Option.flatMap(connectionOf(model, setup.harness), ({ connection }) =>
        Option.exists(findIntegration(model, connection.integration), ({ requiresSandbox }) => requiresSandbox)
          ? Option.some(`${connection.name} works only in a sandbox. Choose one.`)
          : Option.none()
      )

/** Whether a connection chosen for `capability` is one that gives it, which is unknown until the integrations are listed. */
const isUnavailable = (
  model: Pick<Model, "connections" | "integrations">,
  capability: Integration.Capability,
  connectionId: string
): boolean =>
  areIntegrationsListed(model) &&
  connectionId !== "" &&
  !connectionItemsGiving(model, capability).some(({ connection }) => connection.id === connectionId)

const unavailableMessage = "This connection is no longer available to you. Choose another."

/**
 * The configuration `setup` makes, or the parts of it that can't be saved as they are, each with the field to mark
 * it beside: a part it still wants, a connection that is gone or no longer gives what the part needs, a model its
 * connection does not offer, and a harness that works only in a sandbox the setup does not have.
 */
export const checkSetup = (
  model: Pick<Model, "connections" | "integrations" | "offered">,
  setup: AgentSetup.Draft
): Result.Result<Agent.Configuration, ReadonlyArray<AgentSetup.Problem>> => {
  const configuration = AgentSetup.configurationOf(setup)
  const unavailable = (field: AgentSetup.Field, isGone: boolean): ReadonlyArray<AgentSetup.Problem> =>
    isGone ? [{ field, message: unavailableMessage }] : []
  const marked = (field: AgentSetup.Field, message: Option.Option<string>): ReadonlyArray<AgentSetup.Problem> =>
    Option.match(message, { onNone: () => [], onSome: (message) => [{ field, message }] })
  const problems = [
    ...unavailable("Harness", isUnavailable(model, "harnesses", setup.harness)),
    ...unavailable("ModelConnection", isUnavailable(model, "models", setup.modelConnectionId)),
    ...unavailable("Sandbox", isUnavailable(model, "sandboxes", setup.sandbox)),
    ...marked("Model", modelProblem(model, setup)),
    ...marked("Sandbox", sandboxProblem(model, setup)),
    ...(Result.isFailure(configuration) ? [configuration.failure] : [])
  ]

  return Result.isSuccess(configuration) && problems.length === 0
    ? Result.succeed(configuration.success)
    : Result.fail(problems)
}

/** Why the field `field` is marked, among `problems`, if it is. */
export const problemAt = (
  problems: ReadonlyArray<AgentSetup.Problem>,
  field: AgentSetup.Field
): Option.Option<string> => Option.fromUndefinedOr(problems.find((problem) => problem.field === field)?.message)

/** The problems a failure marks beside the fields of a setup. */
export const problemsOf = (failure: Option.Option<Failure>): ReadonlyArray<AgentSetup.Problem> =>
  Option.match(failure, {
    onNone: () => [],
    onSome: ({ reason }) => Reason.matchOrElse(reason, { Incomplete: ({ problems }) => problems }, () => [])
  })

const invalidMessages: Readonly<Record<AgentAction, string>> = {
  Create: "Check the name, instructions, and model, then try again.",
  Rename: "Use 1 to 80 characters, with no invisible ones.",
  Configure: "Check the instructions and model, then save again.",
  Remove: "That change isn't possible."
}

const unwritableMessages: Readonly<Record<AgentAction, string>> = {
  Create: "The agent couldn't be created. Try again when the host is available.",
  Rename: "The name couldn't be saved. Try again when the host is available.",
  Configure: "The setup couldn't be saved. Try again when the host is available.",
  Remove: "The agent couldn't be removed. Try again when the host is available."
}

/** What a failure says under the form that made it, for the action it belongs to. */
export const failureMessage = ({ action, reason }: Failure): string =>
  Reason.match(reason, {
    Invalid: () => invalidMessages[action],
    Incomplete: () => "This setup can't be saved as it is. Change what's marked, then try again.",
    Unwritable: () => unwritableMessages[action]
  })

/**
 * The connections that give `capability` as the choices of a select, each with what `describe` says of its
 * integration, and, when `current` names one that does not give it, that connection too, listed as unavailable:
 * a connection the agent names that was removed or whose integration is not installed stays chosen, and says so.
 */
export const connectionChoices = (
  model: Pick<Model, "connections" | "integrations">,
  capability: Integration.Capability,
  current: string,
  describe: (integration: Connection.IntegrationView) => string
): ReadonlyArray<Choice<string>> => {
  const giving = connectionItemsGiving(model, capability)
  const choices = giving.map(({ connection }): Choice<string> => [
    connection.id,
    connection.name,
    Option.match(findIntegration(model, connection.integration), {
      onNone: () => ({}),
      onSome: (integration) => ({ description: describe(integration) })
    })
  ])

  return current === "" || giving.some(({ connection }) => connection.id === current)
    ? choices
    : [...choices, unavailableChoice(model, current)]
}

/** The connection `connectionId`, which does not give what a select asks for, as a choice that can't be chosen. */
const unavailableChoice = (model: Pick<Model, "connections" | "integrations">, connectionId: string): Choice<string> =>
  Option.match(connectionOf(model, connectionId), {
    onNone: () => [
      connectionId,
      "Removed connection",
      { description: "This connection was removed.", isDisabled: true }
    ],
    onSome: ({ connection }) => [
      connectionId,
      connection.name,
      {
        ...(areIntegrationsListed(model)
          ? {
              description: Option.isSome(findIntegration(model, connection.integration))
                ? "Its integration doesn't give this."
                : "Its integration isn't installed on this host."
            }
          : {}),
        isDisabled: true
      }
    ]
  })

/** A role a new agent may start with, and whether the person may give it. */
export type StartingRole = Readonly<{ role: Role.Role; isGivable: boolean }>

/**
 * The roles a new agent may start with: Member, and Administrator, which only the owner gives. Owner passes by
 * transfer alone, so it is not offered.
 */
export const startingRoles = (model: Pick<Model, "roles" | "workspace" | "memberId">): ReadonlyArray<StartingRole> => {
  const givable = givableRoles(model)

  return model.roles
    .filter(({ id }) => id === BuiltinRoles.MemberId || id === BuiltinRoles.AdministratorId)
    .map((role) => ({ role, isGivable: givable.some(({ id }) => id === role.id) }))
}

/** Whether the form that adds an agent has what an agent needs to be made: a name, a role, and a model. */
export const isAddingReady = ({ name, roleId, setup }: Adding): boolean =>
  name.trim() !== "" && roleId !== "" && setup.modelConnectionId !== "" && setup.modelId.trim() !== ""

/** Whether a request from the dialog is on its way, so that closing it must wait to show how it ends. */
export const isDialogBusy = (model: Pick<Model, "adding" | "removing">): boolean =>
  Option.exists(model.adding, ({ creating }) => Option.exists(creating, ({ isWritten }) => !isWritten)) ||
  Option.exists(model.removing, ({ isSending }) => isSending)

/**
 * The agent the person added, once it is listed: one they made under the name they sent that the workspace did not
 * have when they sent the form.
 */
export const findCreatedAgent = (
  model: Pick<Model, "agents" | "members" | "memberId">,
  creating: Creating
): Option.Option<AgentItem> =>
  Option.fromUndefinedOr(
    listedAgents(model).find(
      ({ agent }) =>
        agent.createdBy === model.memberId &&
        !creating.knownAgentIds.includes(agent.id) &&
        nameOfAgent(model, agent) === creating.name
    )
  )
