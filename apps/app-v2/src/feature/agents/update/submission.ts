/** Agent form validation and the commands each submission issues. */

import type { Identity } from "@amends-dev/core/identity"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import { modifyFields } from "foldkit/struct"
import type { AgentItem } from "../../../data/agents.ts"
import { ConfigureAgent, CreateAgent, RemoveAgent, RenameAgent } from "../command.ts"
import {
  type Adding,
  checkSetup,
  findEdit,
  findListedAgent,
  isAddingReady,
  isNameChanged,
  isSetupChanged,
  mayConfigure,
  type Model,
  nameDraftOf,
  nameOfAgent,
  Reason,
  setupDraftOf
} from "../definition.ts"
import { atAdding, atRemoving, atEdit, markSaving } from "./forms.ts"

/** An existing agent can be edited when access allows it and no change is still on its way. */
const canSaveEdit = (model: Model, item: AgentItem): boolean =>
  mayConfigure(model, item.agent) &&
  !item.pending &&
  Option.isNone(Option.flatMap(findEdit(model, item.agent.id), (edit) => edit.saving))

/**
 * Send the form that adds an agent as an action, or keep it open with the parts of its setup that can't be saved
 * as they are. A form that wants a name or a model, or is on its way already, sends nothing.
 */
export const submitAdding = (model: Model, adding: Adding) => {
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
export const submitRemoval = (model: Model) =>
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
export const submitName = (model: Model, agentId: Identity.AgentId) =>
  Option.match(findListedAgent(model, agentId), {
    onNone: () => ({ model }),
    onSome: (item) => {
      const { workspaceId, memberId } = model
      const canSave = canSaveEdit(model, item) && isNameChanged(model, item)

      return canSave
        ? {
            model: markSaving(model, agentId, "Rename"),
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
export const submitSetup = (model: Model, agentId: Identity.AgentId) =>
  Option.match(findListedAgent(model, agentId), {
    onNone: () => ({ model }),
    onSome: (item) => {
      const { workspaceId, memberId } = model
      const canSave = canSaveEdit(model, item) && isSetupChanged(model, item)

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
              model: markSaving(model, agentId, "Configure"),
              commands: [ConfigureAgent({ workspaceId, memberId, agentId, configuration })]
            })
          })
    }
  })
