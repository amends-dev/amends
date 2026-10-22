/** Agent drafts and their saving or failure state. */

import type { Identity } from "@amends-dev/core/identity"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import {
  type Adding,
  type AgentAction,
  type Edit,
  type Failure,
  findEdit,
  findListedAgent,
  type Model,
  type Reason,
  type Removing,
  SetupTarget,
  setupDraftOf,
  Written
} from "../definition.ts"
import type * as AgentSetup from "../setup.ts"

/** The model with the edit of the agent `agentId` as `change` makes it, which is dropped once it holds nothing. */
export const atEdit = (model: Model, agentId: Identity.AgentId, change: (edit: Edit) => Edit): Model => {
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
export const unlessAbout = (action: AgentAction) => Option.filter((failure: Failure) => failure.action !== action)

/** The model with the form that adds an agent as `change` makes it, while one is open. */
export const atAdding = (model: Model, change: (adding: Adding) => Adding): Model =>
  modifyFields(model, { adding: Option.map(change) })

/** The model with the confirmation that removes an agent as `change` makes it, while one is open. */
export const atRemoving = (model: Model, change: (removing: Removing) => Removing): Model =>
  modifyFields(model, { removing: Option.map(change) })

/** The model with the setup of `target` as `change` makes it, wanting nothing yet, while its form is there. */
export const atSetup = (
  model: Model,
  target: SetupTarget,
  change: (setup: AgentSetup.Draft) => AgentSetup.Draft
): Model =>
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

/** Clear the saved draft and its request state, keeping any other draft the person has. */
export const completeEdit = (model: Model, agentId: Identity.AgentId, field: "name" | "setup"): Model =>
  modifyFields(
    atEdit(model, agentId, (edit) => ({
      ...edit,
      [field]: Option.none(),
      saving: Option.none(),
      failure: Option.none()
    })),
    { notice: () => Option.none() }
  )

/** The model once the action `written` could not be made, for `reason`: said under the form that made it. */
export const refuse = (model: Model, written: Written, reason: Reason): Model =>
  Written.match(written, {
    Create: () =>
      atAdding(model, (adding) =>
        modifyFields(adding, {
          creating: () => Option.none(),
          failure: () => Option.some({ action: "Create" as const, reason })
        })
      ),
    Rename: ({ agentId }) => refuseEdit(model, agentId, "Rename", reason),
    Configure: ({ agentId }) => refuseEdit(model, agentId, "Configure", reason),
    Remove: () =>
      atRemoving(model, (removing) =>
        modifyFields(removing, {
          isSending: () => false,
          failure: () => Option.some({ action: "Remove" as const, reason })
        })
      )
  })

/** Mark an edit as saving, replacing the failure from its previous attempt. */
export const markSaving = (model: Model, agentId: Identity.AgentId, action: "Rename" | "Configure"): Model =>
  atEdit(model, agentId, (edit) => ({ ...edit, saving: Option.some(action), failure: Option.none() }))

/** Keep the draft after a failed save and make it available for another attempt. */
const refuseEdit = (model: Model, agentId: Identity.AgentId, action: "Rename" | "Configure", reason: Reason): Model =>
  atEdit(model, agentId, (edit) => ({ ...edit, saving: Option.none(), failure: Option.some({ action, reason }) }))
