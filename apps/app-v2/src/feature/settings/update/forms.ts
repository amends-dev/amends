/** Settings form drafts and their saving or failure state. */

import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import {
  Entering,
  type Failure,
  type Model,
  type NameEdit,
  type Reason,
  type Selected,
  type SettingsAction
} from "../definition.ts"

export const failureOf = (action: SettingsAction, reason: Reason): Failure => ({ action, reason })

/**
 * What the person typed in the field of a name, with no failure left from the name before it, while it is not on its
 * way.
 */
export const typedName = (edit: Option.Option<NameEdit>, name: string): Option.Option<NameEdit> =>
  Option.some(
    Option.match(edit, {
      onNone: () => ({ name, isSaving: false, failure: Option.none() }),
      onSome: (typing) => (typing.isSaving ? typing : { ...typing, name, failure: Option.none() })
    })
  )

/** The edit of a name once it is sent, which waits for the store to keep it. */
export const sentName = (edit: NameEdit): NameEdit => ({ ...edit, isSaving: true, failure: Option.none() })

/** The edit of a name once `failure` kept it from being sent or kept. */
export const refusedName =
  (failure: Failure) =>
  (edit: NameEdit): NameEdit => ({ ...edit, isSaving: false, failure: Option.some(failure) })

/** The model with the name of the workspace being changed as `change` makes it, while one is. */
export const atWorkspaceName = (model: Model, change: (edit: NameEdit) => NameEdit): Model =>
  modifyFields(model, { workspaceName: Option.map(change) })

/** The model with the member open as `change` makes them, while one is. */
export const atSelected = (model: Model, change: (selected: Selected) => Selected): Model =>
  modifyFields(model, { selected: Option.map(change) })

type Inviting = Extract<Entering, { readonly _tag: "Inviting" }>

type ChangingName = Extract<Entering, { readonly _tag: "ChangingName" }>

/** The model with the invitation being drafted as `change` makes it, while one is and it is not on its way. */
export const atInviting = (model: Model, change: (inviting: Inviting) => Inviting): Model =>
  modifyFields(model, {
    entering: Option.map((entering) =>
      Entering.isAnyOf(["Inviting"])(entering) && !entering.isSending ? change(entering) : entering
    )
  })

/**
 * The model with the person's own name being typed as `change` makes it, while the dialog changes it and its request
 * is not on its way.
 */
export const atChangingName = (model: Model, change: (changing: ChangingName) => ChangingName): Model =>
  modifyFields(model, {
    entering: Option.map((entering) =>
      Entering.isAnyOf(["ChangingName"])(entering) && !entering.isSending ? change(entering) : entering
    )
  })

/** What the dialog is doing once its request is sent, which waits for the store to keep it. */
export const sentEntering = (entering: Entering): Entering =>
  Entering.matchOrElse(entering, { ViewingHistory: () => entering }, (sending) => ({
    ...sending,
    isSending: true,
    failure: Option.none()
  }))

/** What the dialog is doing once `failure` kept its request from being sent or kept. */
export const refusedEntering =
  (failure: Failure) =>
  (entering: Entering): Entering =>
    Entering.matchOrElse(entering, { ViewingHistory: () => entering }, (refused) => ({
      ...refused,
      isSending: false,
      failure: Option.some(failure)
    }))

/** What the dialog is doing with no failure shown, since what the person sees is read again. */
export const unfailedEntering = (entering: Entering): Entering =>
  Entering.matchOrElse(entering, { ViewingHistory: () => entering }, (shown) => ({
    ...shown,
    failure: Option.none()
  }))

/** The model with what the dialog is doing as `change` makes it, while it is doing something. */
export const atEntering = (model: Model, change: (entering: Entering) => Entering): Model =>
  modifyFields(model, { entering: Option.map(change) })

/** The model with the dialog's request refused for `reason`, when `isFor` says the dialog is doing what was written. */
export const refuseEntering = (
  model: Model,
  action: SettingsAction,
  reason: Reason,
  isFor: (entering: Entering) => boolean
): Model =>
  atEntering(model, (entering) => (isFor(entering) ? refusedEntering(failureOf(action, reason))(entering) : entering))
