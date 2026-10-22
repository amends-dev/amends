/** Connection form validation and the commands each submission issues. */

import type { Connection as ConnectionContract } from "@amends-dev/connection"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import { modifyFields } from "foldkit/struct"
import { type ConnectionItem, findConnection, findIntegration, integrationOf } from "../../../data/connections.ts"
import {
  AddConnection,
  ConfigureConnection,
  RemoveConnection,
  RenameConnection,
  ReplaceConnectionKey
} from "../command.ts"
import {
  type Configuring,
  findEdit,
  isNameChanged,
  isSettingsChanged,
  mayManage,
  type Model,
  nameDraftOf,
  settingsDraftOf,
  settingsToAdd
} from "../definition.ts"
import * as SettingsForm from "../settingsForm.ts"
import { atConfiguring, failureOf, markSaving } from "./forms.ts"

/** An existing connection can be edited when access allows it and no change is still on its way. */
const canSaveEdit = (model: Model, item: ConnectionItem): boolean =>
  mayManage(model, item) &&
  !item.pending &&
  Option.isNone(Option.flatMap(findEdit(model, item.connection.id), (edit) => edit.saving))

/**
 * Send the form that adds a connection, when it has what a connection needs, its integration is still listed, and its
 * request is not already sent. For an integration the host no longer lists, nothing is sent and the form says why.
 */
export const submitAdding = (model: Model, configuring: Configuring) => {
  const name = configuring.name.trim()

  if (Option.isSome(configuring.creating)) {
    return { model }
  }

  return Option.match(findIntegration(model, configuring.integrationId), {
    onNone: () => ({
      model: atConfiguring(model, (open) =>
        modifyFields(open, { failure: () => Option.some(failureOf("Create", "Uninstalled")) })
      )
    }),
    onSome: (integration) =>
      Option.match(settingsToAdd(integration, configuring), {
        onNone: () => ({ model }),
        onSome: (settings) => ({
          model: atConfiguring(model, (open) =>
            modifyFields(open, {
              failure: () => Option.none(),
              creating: () => Option.some({ name, connectionId: Option.none() })
            })
          ),
          commands: [
            AddConnection({
              workspaceId: model.workspaceId,
              integration: integration.id,
              name,
              auth: configuring.auth,
              apiKey: configuring.apiKey,
              settings,
              key: configuring.key
            })
          ]
        })
      })
  })
}

/**
 * Send the name the person typed for `connectionId` as an action, when there is a new one to save and nothing else is
 * being saved.
 */
export const submitName = (model: Model, connectionId: ConnectionContract.ConnectionId) =>
  Option.match(findConnection(model, connectionId), {
    onNone: () => ({ model }),
    onSome: (item) => {
      const { workspaceId, memberId } = model
      const canSave = canSaveEdit(model, item) && isNameChanged(model, item)

      return canSave
        ? {
            model: markSaving(model, connectionId, "Rename"),
            commands: [
              RenameConnection({
                workspaceId,
                memberId,
                connectionId,
                name: nameDraftOf(model, item).trim(),
                expectedName: item.connection.name
              })
            ]
          }
        : { model }
    }
  })

/**
 * Send the settings the person edited for `connectionId` as an action, when they differ from the saved ones, make
 * settings, and nothing else is being saved.
 */
export const submitSettings = (model: Model, connectionId: ConnectionContract.ConnectionId) =>
  Option.match(findConnection(model, connectionId), {
    onNone: () => ({ model }),
    onSome: (item) => {
      const { workspaceId, memberId } = model
      const settings = Option.flatMap(integrationOf(model, item), ({ settings: form }) =>
        Option.flatMap(settingsDraftOf(model, item), (draft) => Result.getSuccess(SettingsForm.settingsOf(form, draft)))
      )
      const canSave = canSaveEdit(model, item) && isSettingsChanged(model, item)

      return canSave && Option.isSome(settings)
        ? {
            model: markSaving(model, connectionId, "Configure"),
            commands: [ConfigureConnection({ workspaceId, memberId, connectionId, settings: settings.value })]
          }
        : { model }
    }
  })

/**
 * Send the key the person typed in the dialog as a replacement, unless it is blank, its request is on its way, or the
 * connection is gone.
 */
export const submitNewKey = (model: Model) =>
  Option.match(model.replacing, {
    onNone: () => ({ model }),
    onSome: ({ connectionId, apiKey, isSending }) =>
      isSending || apiKey.trim() === "" || Option.isNone(findConnection(model, connectionId))
        ? { model }
        : {
            model: modifyFields(model, {
              replacing: Option.map((replacing) =>
                modifyFields(replacing, { isSending: () => true, failure: () => Option.none() })
              )
            }),
            commands: [ReplaceConnectionKey({ workspaceId: model.workspaceId, connectionId, apiKey })]
          }
  })

/** Ask to remove the connection the confirmation names, unless its request is on its way or the connection is gone. */
export const submitRemoval = (model: Model) =>
  Option.match(model.removing, {
    onNone: () => ({ model }),
    onSome: ({ connectionId, isSending }) =>
      isSending || Option.isNone(findConnection(model, connectionId))
        ? { model }
        : {
            model: modifyFields(model, {
              removing: Option.map((removing) =>
                modifyFields(removing, { isSending: () => true, failure: () => Option.none() })
              )
            }),
            commands: [RemoveConnection({ workspaceId: model.workspaceId, memberId: model.memberId, connectionId })]
          }
  })
