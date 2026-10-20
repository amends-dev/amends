import { BuiltinRoles } from "@amends-dev/core/authorization"
import type { Identity } from "@amends-dev/core/identity"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import { modifyFields } from "foldkit/struct"
import * as AgentSetup from "../../agentSetup.ts"
import { Integrations } from "../connections/definition.ts"
import { ConfigureAgent, CreateAgent, LoadModels, RenameAgent } from "./command.ts"
import { AgentsComposition } from "./composition.ts"
import {
  type Adding,
  type AgentAction,
  checkSetup,
  type Edit,
  type Failure,
  failureMessage,
  findEdit,
  findListedAgent,
  isNameChanged,
  isSetupChanged,
  mayConfigure,
  Message,
  type Model,
  nameDraftOf,
  nameOfAgent,
  offeredBy,
  OfferedModels,
  OutMessage,
  Reason,
  SetupTarget,
  setupDraftOf,
  Written
} from "./definition.ts"

/** The model with the edit of the agent `agentId` as `change` makes it, which is dropped once it holds nothing. */
const atEdit = (model: Model, agentId: Identity.AgentId, change: (edit: Edit) => Edit): Model => {
  const edit = change(
    Option.getOrElse(findEdit(model, agentId), () => ({
      agentId,
      name: Option.none(),
      setup: Option.none(),
      saving: Option.none(),
      failure: Option.none()
    }))
  )
  const holdsNothing =
    Option.isNone(edit.name) && Option.isNone(edit.setup) && Option.isNone(edit.saving) && Option.isNone(edit.failure)

  return modifyFields(model, {
    edits: (edits) => {
      const others = edits.filter((other) => other.agentId !== agentId)
      return holdsNothing ? others : [...others, edit]
    }
  })
}

/** The failure of an edit unless it is about `action`, which a change to that action's form makes out of date. */
const unlessAbout = (action: AgentAction) => Option.filter((failure: Failure) => failure.action !== action)

/** The model with the form that adds an agent as `change` makes it, while one is open. */
const atAdding = (model: Model, change: (adding: Adding) => Adding): Model =>
  modifyFields(model, { adding: Option.map(change) })

/** The model with the setup of `target` as `change` makes it, wanting nothing yet, while its form is there. */
const atSetup = (model: Model, target: SetupTarget, change: (setup: AgentSetup.Draft) => AgentSetup.Draft): Model =>
  SetupTarget.match(target, {
    Adding: () => atAdding(model, (adding) => modifyFields(adding, { setup: change, failure: () => Option.none() })),
    Agent: ({ agentId }) =>
      Option.match(findListedAgent(model, agentId), {
        onNone: () => model,
        onSome: (item) =>
          atEdit(model, agentId, (edit) =>
            modifyFields(edit, {
              setup: () => Option.some(change(setupDraftOf(model, item))),
              failure: unlessAbout("Configure")
            })
          )
      })
  })

/** The model with `offered` among the models the connections offer, in place of those it had for its connection. */
const withOffered = (model: Model, offered: OfferedModels): Model =>
  modifyFields(model, {
    offered: (all) => [...all.filter(({ connectionId }) => connectionId !== offered.connectionId), offered]
  })

/** Ask for the models `connectionId` offers, if it is one of the workspace's connections. */
const askForModels = (model: Model, connectionId: string) =>
  Option.match(Option.fromUndefinedOr(model.connections.find(({ connection }) => connection.id === connectionId)), {
    onNone: () => ({ model }),
    onSome: ({ connection }) => ({
      model: withOffered(model, OfferedModels.Loading({ connectionId: connection.id })),
      commands: [LoadModels({ workspaceId: model.workspaceId, connectionId: connection.id })]
    })
  })

/** Ask for the models `connectionId` offers, unless they are loaded or on their way. */
const askForModelsOnce = (model: Model, connectionId: string) =>
  Option.exists(offeredBy(model, connectionId), OfferedModels.isAnyOf(["Loading", "Loaded"]))
    ? { model }
    : askForModels(model, connectionId)

/** The form that adds an agent, as it is until the person fills it in. */
const blankAdding: Adding = {
  name: "",
  roleId: BuiltinRoles.MemberId,
  setup: AgentSetup.empty,
  failure: Option.none()
}

/** Send the form that adds an agent as an action, or keep it open with the parts of its setup that can't be saved as they are. */
const submitAdding = (model: Model, adding: Adding) => {
  const { workspaceId, memberId } = model

  return Result.match(checkSetup(model, adding.setup), {
    onFailure: (problems) => ({
      model: atAdding(model, (open) =>
        modifyFields(open, {
          failure: () => Option.some({ action: "Create" as const, reason: Reason.Incomplete({ problems }) })
        })
      )
    }),
    onSuccess: (configuration) => ({
      model: modifyFields(model, { adding: () => Option.none() }),
      commands: [
        CreateAgent({
          workspaceId,
          memberId,
          name: adding.name.trim(),
          roleId: adding.roleId,
          configuration
        })
      ]
    })
  })
}

/** Send the name the person typed for `agentId` as an action, when there is a new one to save and nothing else is being saved. */
const submitName = (model: Model, agentId: Identity.AgentId) =>
  Option.match(findListedAgent(model, agentId), {
    onNone: () => ({ model }),
    onSome: (item) => {
      const { workspaceId, memberId } = model
      const canSave =
        mayConfigure(model, item.agent) &&
        !item.pending &&
        isNameChanged(model, item) &&
        Option.isNone(Option.flatMap(findEdit(model, agentId), (edit) => edit.saving))

      return canSave
        ? {
            model: atEdit(model, agentId, (edit) =>
              modifyFields(edit, { saving: () => Option.some("Rename" as const), failure: () => Option.none() })
            ),
            commands: [
              RenameAgent({
                workspaceId,
                memberId,
                agentId,
                name: nameDraftOf(model, item).trim(),
                expectedName: nameOfAgent(model, item.agent)
              })
            ]
          }
        : { model }
    }
  })

/** Send the setup the person edited for `agentId` as an action, or mark the parts of it that can't be saved as they are. */
const submitSetup = (model: Model, agentId: Identity.AgentId) =>
  Option.match(findListedAgent(model, agentId), {
    onNone: () => ({ model }),
    onSome: (item) => {
      const { workspaceId, memberId } = model
      const canSave =
        mayConfigure(model, item.agent) &&
        !item.pending &&
        isSetupChanged(model, item) &&
        Option.isNone(Option.flatMap(findEdit(model, agentId), (edit) => edit.saving))

      return !canSave
        ? { model }
        : Result.match(checkSetup(model, setupDraftOf(model, item)), {
            onFailure: (problems) => ({
              model: atEdit(model, agentId, (edit) =>
                modifyFields(edit, {
                  failure: () => Option.some({ action: "Configure" as const, reason: Reason.Incomplete({ problems }) })
                })
              )
            }),
            onSuccess: (configuration) => ({
              model: atEdit(model, agentId, (edit) =>
                modifyFields(edit, { saving: () => Option.some("Configure" as const), failure: () => Option.none() })
              ),
              commands: [ConfigureAgent({ workspaceId, memberId, agentId, configuration })]
            })
          })
    }
  })

/** The model once the store kept the action `written`: what the person entered for it is done with. */
const keep = (model: Model, written: Written): Model =>
  Written.match(written, {
    Create: () => modifyFields(model, { notice: () => Option.none() }),
    Rename: ({ agentId }) =>
      modifyFields(
        atEdit(model, agentId, (edit) =>
          modifyFields(edit, { name: () => Option.none(), saving: () => Option.none(), failure: () => Option.none() })
        ),
        { notice: () => Option.none() }
      ),
    Configure: ({ agentId }) =>
      modifyFields(
        atEdit(model, agentId, (edit) =>
          modifyFields(edit, { setup: () => Option.none(), saving: () => Option.none(), failure: () => Option.none() })
        ),
        { notice: () => Option.none() }
      )
  })

/** The model once the action `written` could not be made, for `reason`: said under the form that made it. */
const refuse = (model: Model, written: Written, reason: Reason): Model =>
  Written.match(written, {
    Create: () => modifyFields(model, { notice: () => Option.some(failureMessage({ action: "Create", reason })) }),
    Rename: ({ agentId }) =>
      atEdit(model, agentId, (edit) =>
        modifyFields(edit, {
          saving: () => Option.none(),
          failure: () => Option.some({ action: "Rename" as const, reason })
        })
      ),
    Configure: ({ agentId }) =>
      atEdit(model, agentId, (edit) =>
        modifyFields(edit, {
          saving: () => Option.none(),
          failure: () => Option.some({ action: "Configure" as const, reason })
        })
      )
  })

export const update = AgentsComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedAgents: ({ agents, members, connections, roles, workspace, grants }) => {
      const received = modifyFields(model, {
        isLoaded: () => true,
        agents: () => agents,
        members: () => members,
        connections: () => connections,
        roles: () => roles,
        workspace: () => workspace,
        grants: () => grants
      })
      // What the person changed on the page of an agent no longer there, as one removed, is dropped.
      return {
        model: modifyFields(received, {
          edits: (edits) => edits.filter(({ agentId }) => Option.isSome(findListedAgent(received, agentId)))
        })
      }
    },
    ReceivedIntegrations: ({ integrations }) => ({
      model: modifyFields(model, { integrations: () => Integrations.Loaded({ integrations }) })
    }),
    FailedLoadIntegrations: ({ error }) => ({
      model: modifyFields(model, { integrations: () => Integrations.Failed({ error }) })
    }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedReloadIntegrations: () =>
      Integrations.isAnyOf(["Failed"])(model.integrations)
        ? {
            model: modifyFields(model, { integrations: () => Integrations.Loading() }),
            outMessage: OutMessage.RequestedIntegrations()
          }
        : { model },
    ClickedBrowse: () => ({ model, outMessage: OutMessage.RequestedBrowse() }),
    ChoseBrowseTab: ({ tab }) => ({
      model: modifyFields(model, { browse: (browse) => modifyFields(browse, { tab: () => tab }) })
    }),
    TypedBrowseQuery: ({ query }) => ({
      model: modifyFields(model, { browse: (browse) => modifyFields(browse, { query: () => query }) })
    }),
    // Opening an agent's page needs the models of its connection to show its model and its efforts.
    ClickedAgent: ({ agentId }) => {
      const outMessage = OutMessage.OpenedAgent({ agentId })
      return Option.match(findListedAgent(model, agentId), {
        onNone: () => ({ model, outMessage }),
        onSome: ({ agent }) => ({ ...askForModelsOnce(model, agent.model.connectionId), outMessage })
      })
    },
    ClickedAdd: () => ({
      model: modifyFields(model, { adding: () => Option.some(blankAdding) }),
      outMessage: OutMessage.RequestedBrowse()
    }),
    TypedAddingName: ({ name }) => ({
      model: atAdding(model, (adding) => modifyFields(adding, { name: () => name, failure: () => Option.none() }))
    }),
    ChoseRole: ({ roleId }) => ({
      model: atAdding(model, (adding) => modifyFields(adding, { roleId: () => roleId }))
    }),
    SubmittedAdding: () =>
      Option.match(model.adding, { onNone: () => ({ model }), onSome: (adding) => submitAdding(model, adding) }),
    ClickedCancelAdding: () => ({ model: modifyFields(model, { adding: () => Option.none() }) }),
    TypedName: ({ agentId, name }) => ({
      model: Option.match(findListedAgent(model, agentId), {
        onNone: () => model,
        onSome: () =>
          atEdit(model, agentId, (edit) =>
            modifyFields(edit, { name: () => Option.some(name), failure: unlessAbout("Rename") })
          )
      })
    }),
    SubmittedName: ({ agentId }) => submitName(model, agentId),
    SubmittedSetup: ({ agentId }) => submitSetup(model, agentId),
    ClickedDiscardSetup: ({ agentId }) => ({
      model: atEdit(model, agentId, (edit) =>
        Option.isSome(edit.saving)
          ? edit
          : modifyFields(edit, { setup: () => Option.none(), failure: unlessAbout("Configure") })
      )
    }),
    TypedInstructions: ({ target, instructions }) => ({
      model: atSetup(model, target, (setup) => ({ ...setup, instructions }))
    }),
    ChoseHarness: ({ target, harness }) => ({ model: atSetup(model, target, (setup) => ({ ...setup, harness })) }),
    // Another connection offers other models, so the model is chosen again from what it offers.
    ChoseModelConnection: ({ target, connectionId }) =>
      askForModels(
        atSetup(model, target, (setup) => ({ ...setup, modelConnectionId: connectionId, modelId: "", effort: "" })),
        connectionId
      ),
    ChoseModel: ({ target, modelId }) => ({
      model: atSetup(model, target, (setup) => ({ ...setup, modelId, effort: "" }))
    }),
    ChoseEffort: ({ target, effort }) => ({ model: atSetup(model, target, (setup) => ({ ...setup, effort })) }),
    ChoseSandbox: ({ target, sandbox }) => ({ model: atSetup(model, target, (setup) => ({ ...setup, sandbox })) }),
    ReceivedModels: ({ connectionId, models }) => ({
      model: withOffered(model, OfferedModels.Loaded({ connectionId, models }))
    }),
    FailedLoadModels: ({ connectionId, error }) => ({
      model: withOffered(model, OfferedModels.Failed({ connectionId, error }))
    }),
    WroteAction: ({ written }) => ({ model: keep(model, written) }),
    FailedWriteAction: ({ written, reason }) => ({ model: refuse(model, written, reason) })
  })
)
