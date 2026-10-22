/** Connection drafts, retry keys, and their saving or failure state. */

import type { Connection as ConnectionContract } from "@amends-dev/connection"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import {
  Adding,
  type Configuring,
  type ConnectionsAction,
  type Edit,
  type Failure,
  findEdit,
  type Model,
  type Reason,
  Written
} from "../definition.ts"

/** A failure of `action` for `reason`, with nothing the integration said. */
export const failureOf = (action: ConnectionsAction, reason: Reason): Failure => ({
  action,
  reason,
  description: Option.none()
})

/**
 * The model with the edit of the connection `connectionId` as `change` makes it, which is dropped once it holds
 * nothing.
 */
export const atEdit = (
  model: Model,
  connectionId: ConnectionContract.ConnectionId,
  change: (edit: Edit) => Edit
): Model => {
  const edit = change(
    Option.getOrElse(findEdit(model, connectionId), () => ({
      connectionId,
      name: Option.none(),
      settings: Option.none(),
      saving: Option.none(),
      failure: Option.none()
    }))
  )
  const holdsNothing =
    Option.isNone(edit.name) &&
    Option.isNone(edit.settings) &&
    Option.isNone(edit.saving) &&
    Option.isNone(edit.failure)

  return modifyFields(model, {
    edits: (edits) => {
      const others = edits.filter((other) => other.connectionId !== connectionId)
      return holdsNothing ? others : [...others, edit]
    }
  })
}

/** The failure of an edit unless it is about `action`, which a change to that action's form makes out of date. */
export const unlessAbout = (action: ConnectionsAction) => Option.filter((failure: Failure) => failure.action !== action)

/** The model with the form that adds a connection as `change` makes it, while one is open. */
export const atAdding = (model: Model, change: (adding: Adding) => Adding): Model =>
  modifyFields(model, { adding: Option.map(change) })

/** The model with the form that adds a connection, while the dialog shows it, as `change` makes it. */
export const atConfiguring = (model: Model, change: (configuring: Configuring) => Configuring): Model =>
  atAdding(model, (adding) => Adding.matchOrElse(adding, { Configuring: change }, () => adding))

/**
 * The model with what the person filled in to add a connection as `change` makes it, unless its request was sent. The
 * key of an earlier attempt and the failure it ended in are dropped, since the values they were for are not these.
 */
export const atDraft = (model: Model, change: (configuring: Configuring) => Configuring): Model =>
  atConfiguring(model, (configuring) =>
    Option.isSome(configuring.creating)
      ? configuring
      : modifyFields(change(configuring), { key: () => Option.none(), failure: () => Option.none() })
  )

/** Clear the saved draft and its request state, keeping any other draft the person has. */
export const completeEdit = (
  model: Model,
  connectionId: ConnectionContract.ConnectionId,
  field: "name" | "settings"
): Model =>
  modifyFields(
    atEdit(model, connectionId, (edit) => ({
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
    Rename: ({ connectionId }) => refuseEdit(model, connectionId, "Rename", reason),
    Configure: ({ connectionId }) => refuseEdit(model, connectionId, "Configure", reason),
    Remove: () =>
      modifyFields(model, {
        removing: Option.map((removing) =>
          modifyFields(removing, { isSending: () => false, failure: () => Option.some(failureOf("Remove", reason)) })
        )
      })
  })

/** The model with the failures the dialog shows dropped, which what the person sees being out of date makes stale. */
export const withoutDialogFailures = (model: Model): Model =>
  modifyFields(model, {
    adding: Option.map((adding) =>
      Adding.matchOrElse(
        adding,
        { Configuring: (configuring) => Adding.Configuring({ ...configuring, failure: Option.none() }) },
        () => adding
      )
    ),
    replacing: Option.map((replacing) => modifyFields(replacing, { failure: () => Option.none() })),
    removing: Option.map((removing) => modifyFields(removing, { failure: () => Option.none() }))
  })

/** Mark an edit as saving, replacing the failure from its previous attempt. */
export const markSaving = (
  model: Model,
  connectionId: ConnectionContract.ConnectionId,
  action: "Rename" | "Configure"
): Model => atEdit(model, connectionId, (edit) => ({ ...edit, saving: Option.some(action), failure: Option.none() }))

/** Keep the draft after a failed save and make it available for another attempt. */
const refuseEdit = (
  model: Model,
  connectionId: ConnectionContract.ConnectionId,
  action: "Rename" | "Configure",
  reason: Reason
): Model =>
  atEdit(model, connectionId, (edit) => ({
    ...edit,
    saving: Option.none(),
    failure: Option.some(failureOf(action, reason))
  }))
