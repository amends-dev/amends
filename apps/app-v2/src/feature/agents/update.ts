import { BuiltinRoles } from "@amends-dev/core/authorization"
import type { Identity } from "@amends-dev/core/identity"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import * as AgentSetup from "../../agentSetup.ts"
import { Integrations } from "../../data/connections.ts"
import { ConfigureAgent, CreateAgent, LoadModels, RemoveAgent, RenameAgent } from "./command.ts"
import { AgentsComposition, DialogBinding, leaveDialog } from "./composition.ts"
import {
  type Adding,
  type AgentAction,
  AgentsDefinition,
  checkSetup,
  type Edit,
  type Failure,
  findCreatedAgent,
  findEdit,
  findListedAgent,
  isAddingReady,
  isNameChanged,
  isSetupChanged,
  mayConfigure,
  mayRemove,
  Message,
  type Model,
  nameDraftOf,
  nameOfAgent,
  offeredBy,
  OfferedModels,
  OutMessage,
  Reason,
  type Removing,
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

/** The model with the confirmation that removes an agent as `change` makes it, while one is open. */
const atRemoving = (model: Model, change: (removing: Removing) => Removing): Model =>
  modifyFields(model, { removing: Option.map(change) })

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
  failure: Option.none(),
  creating: Option.none()
}

/** Ask for the dialog on a blank form that adds an agent. */
const openAdding = AgentsDefinition.stepFields(() => ({
  adding: () => Option.some(blankAdding),
  removing: () => Option.none()
}))

/** Ask for the dialog on the confirmation that removes `agentId`, which is called `name` now. */
const openRemoving = (agentId: Identity.AgentId, name: string) =>
  AgentsDefinition.stepFields(() => ({
    adding: () => Option.none(),
    removing: () => Option.some({ agentId, name, isSending: false, failure: Option.none() })
  }))

/** Ask for the models of the connection `connectionId` unless they are loaded or on their way. */
const askForModelsOnceStep = (connectionId: string) =>
  AgentsDefinition.step((model: Model) => askForModelsOnce(model, connectionId))

/** Close the dialog, whose form or confirmation is done with. */
const closeDialog = Update.combine([leaveDialog, DialogBinding.requestClose()])

/**
 * Send the form that adds an agent as an action, or keep it open with the parts of its setup that can't be saved
 * as they are. A form that wants a name or a model, or is on its way already, sends nothing.
 */
const submitAdding = (model: Model, adding: Adding) => {
  const { workspaceId, memberId } = model

  if (!isAddingReady(adding) || Option.isSome(adding.creating)) {
    return { model }
  }

  return Result.match(checkSetup(model, adding.setup), {
    onFailure: (problems) => ({
      model: atAdding(model, (open) =>
        modifyFields(open, {
          failure: () => Option.some({ action: "Create" as const, reason: Reason.Incomplete({ problems }) })
        })
      )
    }),
    onSuccess: (configuration) => ({
      model: atAdding(model, (open) =>
        modifyFields(open, {
          failure: () => Option.none(),
          creating: () =>
            Option.some({
              name: adding.name.trim(),
              knownAgentIds: model.agents.map(({ agent }) => agent.id),
              isWritten: false
            })
        })
      ),
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

/** Ask to remove the agent the confirmation names, unless its request is on its way or the agent is gone. */
const submitRemoval = (model: Model) =>
  Option.match(model.removing, {
    onNone: () => ({ model }),
    onSome: ({ agentId, isSending }) =>
      Option.match(findListedAgent(model, agentId), {
        onNone: () => ({ model }),
        onSome: ({ agent }) =>
          isSending
            ? { model }
            : {
                model: atRemoving(model, (removing) =>
                  modifyFields(removing, { isSending: () => true, failure: () => Option.none() })
                ),
                commands: [
                  RemoveAgent({
                    workspaceId: model.workspaceId,
                    memberId: model.memberId,
                    agentId,
                    removeMemberId: agent.memberId
                  })
                ]
              }
      })
  })

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

/** The model with the edit of `agentId` as `change` makes it, once the store has kept the action it was for, so that no failure of an earlier read or write is left to show. */
const keepEdit = (model: Model, agentId: Identity.AgentId, change: (edit: Edit) => Edit): Model =>
  modifyFields(atEdit(model, agentId, change), { notice: () => Option.none() })

/** The model once the action `written` could not be made, for `reason`: said under the form that made it. */
const refuse = (model: Model, written: Written, reason: Reason): Model =>
  Written.match(written, {
    Create: () =>
      atAdding(model, (adding) =>
        modifyFields(adding, {
          creating: () => Option.none(),
          failure: () => Option.some({ action: "Create" as const, reason })
        })
      ),
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
      ),
    Remove: () =>
      atRemoving(model, (removing) =>
        modifyFields(removing, {
          isSending: () => false,
          failure: () => Option.some({ action: "Remove" as const, reason })
        })
      )
  })

export const update = AgentsComposition.makeUpdate((model, message) => {
  /**
   * Finish adding an agent once the store has kept the action and has listed the agent it made: close the dialog,
   * ask for the models the agent's page shows, and report the agent for the page to open.
   */
  const finishAdding = (current: typeof model) =>
    Option.match(
      Option.flatMap(current.adding, ({ creating }) =>
        Option.flatMap(creating, (sent) => findCreatedAgent(current, sent))
      ),
      {
        onNone: () => ({ model: current }),
        onSome: ({ agent }) =>
          pipe(
            Update.combine(current, [askForModelsOnceStep(agent.model.connectionId), closeDialog]),
            Update.withOutMessage(OutMessage.CreatedAgent({ agentId: agent.id, name: nameOfAgent(current, agent) }))
          )
      }
    )

  /**
   * Close the confirmation that removes an agent the workspace no longer lists, when it was removed by someone else
   * and the person's own request is not on its way.
   */
  const closeRemovalOfGoneAgent = (current: typeof model) =>
    Option.exists(
      current.removing,
      ({ agentId, isSending }) => !isSending && Option.isNone(findListedAgent(current, agentId))
    )
      ? Update.combine(current, [closeDialog])
      : { model: current }

  /** Open the confirmation that removes `agentId`, where the person may remove it. */
  const askToRemove = (agentId: Identity.AgentId) =>
    Option.match(findListedAgent(model, agentId), {
      onNone: () => ({ model }),
      onSome: (item) =>
        mayRemove(model, item.agent) && !item.pending
          ? Update.combine(model, [openRemoving(agentId, nameOfAgent(model, item.agent)), DialogBinding.requestOpen()])
          : { model }
    })

  /** What follows the store keeping the action `written`: what the person entered for it is done with. */
  const keep = (written: Written) =>
    Written.match(written, {
      Create: () =>
        finishAdding(
          modifyFields(model, {
            adding: Option.map((adding) =>
              modifyFields(adding, { creating: Option.map((sent) => ({ ...sent, isWritten: true })) })
            ),
            notice: () => Option.none()
          })
        ),
      Rename: ({ agentId }) => ({
        model: keepEdit(model, agentId, (edit) =>
          modifyFields(edit, { name: () => Option.none(), saving: () => Option.none(), failure: () => Option.none() })
        ),
        outMessage: OutMessage.SavedName()
      }),
      Configure: ({ agentId }) => ({
        model: keepEdit(model, agentId, (edit) =>
          modifyFields(edit, { setup: () => Option.none(), saving: () => Option.none(), failure: () => Option.none() })
        ),
        outMessage: OutMessage.SavedSetup()
      }),
      Remove: ({ agentId }) =>
        Option.match(
          Option.filter(model.removing, (removing) => removing.agentId === agentId),
          {
            onNone: () => ({ model }),
            onSome: ({ name }) =>
              pipe(Update.combine(model, [closeDialog]), Update.withOutMessage(OutMessage.RemovedAgent({ name })))
          }
        )
    })

  return Message.match(message, {
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
      const withoutGone = modifyFields(received, {
        edits: (edits) => edits.filter(({ agentId }) => Option.isSome(findListedAgent(received, agentId)))
      })
      return Option.isSome(withoutGone.adding) ? finishAdding(withoutGone) : closeRemovalOfGoneAgent(withoutGone)
    },
    ReceivedActivity: ({ turns, groups }) => ({
      model: modifyFields(model, { turns: () => turns, groups: () => groups })
    }),
    ReceivedIntegrations: ({ integrations }) => ({
      model: modifyFields(model, { integrations: () => Integrations.cases.Loaded.make({ integrations }) })
    }),
    FailedLoadIntegrations: ({ error }) => ({
      model: modifyFields(model, { integrations: () => Integrations.cases.Failed.make({ error }) })
    }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedRetry: () => ({
      model: modifyFields(model, { notice: () => Option.none(), reads: (reads) => reads + 1 })
    }),
    ClickedReloadIntegrations: () =>
      Integrations.isAnyOf(["Failed"])(model.integrations)
        ? {
            model: modifyFields(model, { integrations: () => Integrations.cases.Loading.make({}) }),
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
    ClickedTurn: ({ groupId, threadId }) => ({ model, outMessage: OutMessage.OpenedThread({ groupId, threadId }) }),
    // Opening an agent's page needs the models of its connection to show its model and its efforts.
    ClickedAgent: ({ agentId }) => {
      const outMessage = OutMessage.OpenedAgent({ agentId })
      return Option.match(findListedAgent(model, agentId), {
        onNone: () => ({ model, outMessage }),
        onSome: ({ agent }) => ({ ...askForModelsOnce(model, agent.model.connectionId), outMessage })
      })
    },
    ClickedAdd: () => Update.combine(model, [openAdding, DialogBinding.requestOpen()]),
    TypedAddingName: ({ name }) => ({
      model: atAdding(model, (adding) => modifyFields(adding, { name: () => name, failure: () => Option.none() }))
    }),
    ChoseRole: ({ roleId }) => ({
      model: atAdding(model, (adding) => modifyFields(adding, { roleId: () => roleId }))
    }),
    SubmittedAdding: () =>
      Option.match(model.adding, { onNone: () => ({ model }), onSome: (adding) => submitAdding(model, adding) }),
    ClickedRemove: ({ agentId }) => askToRemove(agentId),
    ConfirmedRemoval: () => submitRemoval(model),
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
    WroteAction: ({ written }) => keep(written),
    FailedWriteAction: ({ written, reason }) => ({ model: refuse(model, written, reason) })
  })
})
