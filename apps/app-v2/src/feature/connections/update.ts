import type { Connection as ConnectionContract } from "@amends-dev/connection"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import { modifyFields } from "foldkit/struct"
import * as SettingsForm from "../../settingsForm.ts"
import { CheckConnection, ConfigureConnection, RenameConnection } from "./command.ts"
import { ConnectionsComposition } from "./composition.ts"
import {
  byName,
  Check,
  type CheckItem,
  type ConnectionsAction,
  type Edit,
  type Failure,
  findConnection,
  findEdit,
  Integrations,
  integrationOf,
  isNameChanged,
  isSettingsChanged,
  mayManage,
  Message,
  type Model,
  nameDraftOf,
  OutMessage,
  type Reason,
  settingsDraftOf,
  Written
} from "./definition.ts"

/**
 * The model with the edit of the connection `connectionId` as `change` makes it, which is dropped once it holds
 * nothing.
 */
const atEdit = (model: Model, connectionId: ConnectionContract.ConnectionId, change: (edit: Edit) => Edit): Model => {
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
const unlessAbout = (action: ConnectionsAction) => Option.filter((failure: Failure) => failure.action !== action)

/** `checks` with the check of `connectionId` as `check`, in place of the last one. */
const withCheck = (
  checks: ReadonlyArray<CheckItem>,
  connectionId: ConnectionContract.ConnectionId,
  check: Check
): ReadonlyArray<CheckItem> => [...checks.filter((item) => item.connectionId !== connectionId), { connectionId, check }]

/** Whether a check of `connectionId` is under way. */
const isChecking = (model: Model, connectionId: ConnectionContract.ConnectionId): boolean =>
  model.checks.some((item) => item.connectionId === connectionId && Check.isAnyOf(["Checking"])(item.check))

/**
 * Send the name the person typed for `connectionId` as an action, when there is a new one to save and nothing else is
 * being saved.
 */
const submitName = (model: Model, connectionId: ConnectionContract.ConnectionId) =>
  Option.match(findConnection(model, connectionId), {
    onNone: () => ({ model }),
    onSome: (item) => {
      const { workspaceId, memberId } = model
      const canSave =
        mayManage(model, item) &&
        !item.pending &&
        isNameChanged(model, item) &&
        Option.isNone(Option.flatMap(findEdit(model, connectionId), (edit) => edit.saving))

      return canSave
        ? {
            model: atEdit(model, connectionId, (edit) =>
              modifyFields(edit, { saving: () => Option.some("Rename" as const), failure: () => Option.none() })
            ),
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
const submitSettings = (model: Model, connectionId: ConnectionContract.ConnectionId) =>
  Option.match(findConnection(model, connectionId), {
    onNone: () => ({ model }),
    onSome: (item) => {
      const { workspaceId, memberId } = model
      const settings = Option.flatMap(integrationOf(model, item), ({ settings: form }) =>
        Option.flatMap(settingsDraftOf(model, item), (draft) => Result.getSuccess(SettingsForm.settingsOf(form, draft)))
      )
      const canSave =
        mayManage(model, item) &&
        !item.pending &&
        isSettingsChanged(model, item) &&
        Option.isNone(Option.flatMap(findEdit(model, connectionId), (edit) => edit.saving))

      return canSave && Option.isSome(settings)
        ? {
            model: atEdit(model, connectionId, (edit) =>
              modifyFields(edit, { saving: () => Option.some("Configure" as const), failure: () => Option.none() })
            ),
            commands: [ConfigureConnection({ workspaceId, memberId, connectionId, settings: settings.value })]
          }
        : { model }
    }
  })

/**
 * The model with the edit of `connectionId` as `change` makes it, once the store has kept the action it was for, so
 * that no failure of an earlier read or write is left to show.
 */
const keepEdit = (model: Model, connectionId: ConnectionContract.ConnectionId, change: (edit: Edit) => Edit): Model =>
  modifyFields(atEdit(model, connectionId, change), { notice: () => Option.none() })

/** The model once the action `written` could not be made, for `reason`: said under the form that made it. */
const refuse = (model: Model, written: Written, reason: Reason): Model =>
  Written.match(written, {
    Rename: ({ connectionId }) =>
      atEdit(model, connectionId, (edit) =>
        modifyFields(edit, {
          saving: () => Option.none(),
          failure: () => Option.some({ action: "Rename" as const, reason, description: Option.none() })
        })
      ),
    Configure: ({ connectionId }) =>
      atEdit(model, connectionId, (edit) =>
        modifyFields(edit, {
          saving: () => Option.none(),
          failure: () => Option.some({ action: "Configure" as const, reason, description: Option.none() })
        })
      )
  })

export const update = ConnectionsComposition.makeUpdate((model, message) => {
  /** What follows the store keeping the action `written`: what the person entered for it is done with. */
  const keep = (written: Written) =>
    Written.match(written, {
      Rename: ({ connectionId }) => ({
        model: keepEdit(model, connectionId, (edit) =>
          modifyFields(edit, { name: () => Option.none(), saving: () => Option.none(), failure: () => Option.none() })
        )
      }),
      Configure: ({ connectionId }) => ({
        model: keepEdit(model, connectionId, (edit) =>
          modifyFields(edit, {
            settings: () => Option.none(),
            saving: () => Option.none(),
            failure: () => Option.none()
          })
        )
      })
    })

  return Message.match(message, {
    ReceivedConnections: ({ connections }) => {
      const sorted = connections.toSorted(byName)
      const isListed = (connectionId: ConnectionContract.ConnectionId) =>
        sorted.some(({ connection }) => connection.id === connectionId)
      return {
        model: modifyFields(model, {
          connections: () => sorted,
          isLoaded: () => true,
          // What the person changed on the page of a connection no longer there, as one removed, and its check, go.
          edits: (edits) => edits.filter(({ connectionId }) => isListed(connectionId)),
          checks: (checks) => checks.filter(({ connectionId }) => isListed(connectionId))
        })
      }
    },
    ReceivedMembers: ({ members }) => ({ model: modifyFields(model, { members: () => members }) }),
    ReceivedGrants: ({ grants }) => ({ model: modifyFields(model, { grants: () => grants }) }),
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
    // What the person sees is out of date: the integrations are listed again, and what failed is no longer shown.
    ClickedRefresh: () => ({
      model: modifyFields(model, {
        edits: (edits) => edits.map((edit) => modifyFields(edit, { failure: () => Option.none() })),
        checks: (checks) => checks.filter(({ check }) => !Check.isAnyOf(["Failed"])(check))
      }),
      outMessage: OutMessage.RequestedIntegrations()
    }),
    ClickedBrowse: ({ tab }) => ({
      model: modifyFields(model, { browse: (browse) => modifyFields(browse, { tab: () => tab }) }),
      outMessage: OutMessage.RequestedBrowse()
    }),
    ClickedBrowseChannels: () => ({ model, outMessage: OutMessage.RequestedChannels() }),
    ClickedConnection: ({ connectionId }) => ({ model, outMessage: OutMessage.OpenedConnection({ connectionId }) }),
    ChoseBrowseTab: ({ tab }) => ({
      model: modifyFields(model, { browse: () => ({ tab, query: "" }) })
    }),
    TypedBrowseQuery: ({ query }) => ({
      model: modifyFields(model, { browse: (browse) => modifyFields(browse, { query: () => query }) })
    }),
    TypedName: ({ connectionId, name }) => ({
      model: Option.match(findConnection(model, connectionId), {
        onNone: () => model,
        onSome: () =>
          atEdit(model, connectionId, (edit) =>
            modifyFields(edit, { name: () => Option.some(name), failure: unlessAbout("Rename") })
          )
      })
    }),
    SubmittedName: ({ connectionId }) => submitName(model, connectionId),
    ChangedSetting: ({ connectionId, name, value }) => ({
      model: Option.match(
        Option.flatMap(findConnection(model, connectionId), (item) => settingsDraftOf(model, item)),
        {
          onNone: () => model,
          onSome: (draft) =>
            atEdit(model, connectionId, (edit) =>
              modifyFields(edit, {
                settings: () => Option.some({ ...draft, [name]: value }),
                failure: unlessAbout("Configure")
              })
            )
        }
      )
    }),
    SubmittedSettings: ({ connectionId }) => submitSettings(model, connectionId),
    ClickedCheck: ({ connectionId }) =>
      Option.exists(findConnection(model, connectionId), (item) => mayManage(model, item)) &&
      !isChecking(model, connectionId)
        ? {
            model: modifyFields(model, {
              checks: (checks) => withCheck(checks, connectionId, Check.Checking())
            }),
            commands: [CheckConnection({ workspaceId: model.workspaceId, connectionId })]
          }
        : { model },
    CheckedConnection: ({ connectionId, health }) => ({
      model: modifyFields(model, { checks: (checks) => withCheck(checks, connectionId, Check.Checked({ health })) })
    }),
    FailedCheckConnection: ({ connectionId, failure }) => ({
      model: modifyFields(model, { checks: (checks) => withCheck(checks, connectionId, Check.Failed({ failure })) })
    }),
    WroteAction: ({ written }) => keep(written),
    FailedWriteAction: ({ written, reason }) => ({ model: refuse(model, written, reason) })
  })
})
