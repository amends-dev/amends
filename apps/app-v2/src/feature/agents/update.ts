/** Incoming agent facts, dialog coordination, and message routing. */

import { BuiltinRoles } from "@amends-dev/core/authorization"
import type { Identity } from "@amends-dev/core/identity"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { Integrations } from "../../data/connections.ts"
import { AgentsComposition, DialogBinding, leaveDialog } from "./composition.ts"
import {
  type Adding,
  AgentsDefinition,
  findCreatedAgent,
  findListedAgent,
  mayRemove,
  Message,
  type Model,
  nameOfAgent,
  OfferedModels,
  OutMessage,
  Written
} from "./definition.ts"
import * as AgentSetup from "./setup.ts"
import { atEdit, unlessAbout, atAdding, atSetup, completeEdit, refuse } from "./update/forms.ts"
import { withOffered, askForModels, askForModelsOnce } from "./update/models.ts"
import { submitAdding, submitRemoval, submitName, submitSetup } from "./update/submission.ts"

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
        model: completeEdit(model, agentId, "name"),
        outMessage: OutMessage.SavedName()
      }),
      Configure: ({ agentId }) => ({
        model: completeEdit(model, agentId, "setup"),
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
