import type { Connection as ConnectionContract, Integration } from "@amends-dev/connection"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import * as SettingsForm from "../../settingsForm.ts"
import {
  AddConnection,
  CheckConnection,
  ConfigureConnection,
  FocusField,
  RemoveConnection,
  RenameConnection,
  ReplaceConnectionKey
} from "./command.ts"
import { ConnectionsComposition, DialogBinding, leaveDialog } from "./composition.ts"
import {
  Adding,
  byName,
  Check,
  type CheckItem,
  type Configuring,
  configuringOf,
  type ConnectionsAction,
  ConnectionsDefinition,
  type Edit,
  type Failure,
  findConnection,
  findEdit,
  findIntegration,
  Integrations,
  integrationOf,
  integrationsToAdd,
  isNameChanged,
  isSettingsChanged,
  mayAdd,
  mayManage,
  Message,
  type Model,
  nameDraftOf,
  OutMessage,
  type Reason,
  settingsDraftOf,
  settingsToAdd,
  startConfiguring,
  Written
} from "./definition.ts"

/** A failure of `action` for `reason`, with nothing the integration said. */
const failureOf = (action: ConnectionsAction, reason: Reason): Failure => ({
  action,
  reason,
  description: Option.none()
})

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

/** The model with the form that adds a connection as `change` makes it, while one is open. */
const atAdding = (model: Model, change: (adding: Adding) => Adding): Model =>
  modifyFields(model, { adding: Option.map(change) })

/** The model with the form that adds a connection, while the dialog shows it, as `change` makes it. */
const atConfiguring = (model: Model, change: (configuring: Configuring) => Configuring): Model =>
  atAdding(model, (adding) => Adding.matchOrElse(adding, { Configuring: change }, () => adding))

/**
 * The model with what the person filled in to add a connection as `change` makes it, unless its request was sent. The
 * key of an earlier attempt and the failure it ended in are dropped, since the values they were for are not these.
 */
const atDraft = (model: Model, change: (configuring: Configuring) => Configuring): Model =>
  atConfiguring(model, (configuring) =>
    Option.isSome(configuring.creating)
      ? configuring
      : modifyFields(change(configuring), { key: () => Option.none(), failure: () => Option.none() })
  )

/**
 * Ask for the dialog on the integrations to add a connection through, among those that give `capability` when given.
 */
const openAdding = (capability: Option.Option<Integration.Capability>) =>
  ConnectionsDefinition.stepFields(() => ({
    adding: () => Option.some(Adding.Choosing({ capability, query: "" })),
    replacing: () => Option.none(),
    removing: () => Option.none()
  }))

/** Ask for the dialog on a blank form that replaces the key of `connectionId`, which is called `name` now. */
const openReplacing = (connectionId: ConnectionContract.ConnectionId, name: string) =>
  ConnectionsDefinition.stepFields(() => ({
    adding: () => Option.none(),
    replacing: () => Option.some({ connectionId, name, apiKey: "", isSending: false, failure: Option.none() }),
    removing: () => Option.none()
  }))

/** Ask for the dialog on the confirmation that removes `connectionId`, which is called `name` now. */
const openRemoving = (connectionId: ConnectionContract.ConnectionId, name: string, hasKey: boolean) =>
  ConnectionsDefinition.stepFields(() => ({
    adding: () => Option.none(),
    replacing: () => Option.none(),
    removing: () => Option.some({ connectionId, name, hasKey, isSending: false, failure: Option.none() })
  }))

/** Close the dialog, whose form or confirmation is done with. */
const closeDialog = Update.combine([leaveDialog, DialogBinding.requestClose()])

/** Move focus to the field `id`. */
const focusField = (id: string) =>
  ConnectionsDefinition.step((model: Model) => ({ model, commands: [FocusField({ id })] }))

/** Check `connectionId` with its system, unless that is under way or the person may not manage it. */
const checkStep = (connectionId: ConnectionContract.ConnectionId) =>
  ConnectionsDefinition.step((model: Model) =>
    Option.exists(findConnection(model, connectionId), (item) => mayManage(model, item)) &&
    !isChecking(model, connectionId)
      ? {
          model: modifyFields(model, { checks: (checks) => withCheck(checks, connectionId, Check.Checking()) }),
          commands: [CheckConnection({ workspaceId: model.workspaceId, connectionId })]
        }
      : { model }
  )

/**
 * Send the form that adds a connection, when it has what a connection needs, its integration is still listed, and its
 * request is not already sent. For an integration the host no longer lists, nothing is sent and the form says why.
 */
const submitAdding = (model: Model, configuring: Configuring) => {
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
 * Send the key the person typed in the dialog as a replacement, unless it is blank, its request is on its way, or the
 * connection is gone.
 */
const submitNewKey = (model: Model) =>
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
const submitRemoval = (model: Model) =>
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
          failure: () => Option.some(failureOf("Rename", reason))
        })
      ),
    Configure: ({ connectionId }) =>
      atEdit(model, connectionId, (edit) =>
        modifyFields(edit, {
          saving: () => Option.none(),
          failure: () => Option.some(failureOf("Configure", reason))
        })
      ),
    Remove: () =>
      modifyFields(model, {
        removing: Option.map((removing) =>
          modifyFields(removing, { isSending: () => false, failure: () => Option.some(failureOf("Remove", reason)) })
        )
      })
  })

/** The model with the failures the dialog shows dropped, which what the person sees being out of date makes stale. */
const withoutDialogFailures = (model: Model): Model =>
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

export const update = ConnectionsComposition.makeUpdate((model, message) => {
  /**
   * Finish adding a connection once the host has made it and the store lists it: close the dialog, check the
   * connection as its page, which opens, will show, and report it.
   */
  const finishAdding = (current: typeof model) =>
    Option.match(
      Option.flatMap(configuringOf(current), ({ creating }) =>
        Option.flatMap(creating, ({ name, connectionId }) => Option.map(connectionId, (id) => ({ id, name })))
      ),
      {
        onNone: () => ({ model: current }),
        onSome: ({ id, name }) =>
          Option.isSome(findConnection(current, id))
            ? pipe(
                Update.combine(current, [closeDialog, checkStep(id)]),
                Update.withOutMessage(OutMessage.CreatedConnection({ connectionId: id, name }))
              )
            : { model: current }
      }
    )

  /**
   * Close the dialog on a connection the workspace no longer lists, when someone else removed it and the person's own
   * request is not on its way.
   */
  const closeDialogOfGoneConnection = (current: typeof model) => {
    const isGone = (connectionId: ConnectionContract.ConnectionId) =>
      Option.isNone(findConnection(current, connectionId))

    return Option.exists(current.removing, ({ connectionId, isSending }) => !isSending && isGone(connectionId)) ||
      Option.exists(current.replacing, ({ connectionId, isSending }) => !isSending && isGone(connectionId))
      ? Update.combine(current, [closeDialog])
      : { model: current }
  }

  /** Open the dialog on the integrations to add a connection through, where the person may add one. */
  const askToAdd = (capability: Option.Option<Integration.Capability>) =>
    mayAdd(model) && Option.isNone(model.adding)
      ? Update.combine(model, [openAdding(capability), DialogBinding.requestOpen()])
      : { model }

  /** Open the dialog on the form that replaces the key of `connectionId`, where the person may and it has a key. */
  const askToReplaceKey = (connectionId: ConnectionContract.ConnectionId) =>
    Option.match(findConnection(model, connectionId), {
      onNone: () => ({ model }),
      onSome: (item) =>
        mayManage(model, item) && !item.pending && item.connection.auth === "apiKey"
          ? Update.combine(model, [openReplacing(connectionId, item.connection.name), DialogBinding.requestOpen()])
          : { model }
    })

  /** Open the confirmation that removes `connectionId`, where the person may remove it. */
  const askToRemove = (connectionId: ConnectionContract.ConnectionId) =>
    Option.match(findConnection(model, connectionId), {
      onNone: () => ({ model }),
      onSome: (item) =>
        mayManage(model, item) && !item.pending
          ? Update.combine(model, [
              openRemoving(connectionId, item.connection.name, item.connection.auth === "apiKey"),
              DialogBinding.requestOpen()
            ])
          : { model }
    })

  /** Choose the integration `integrationId` to add a connection through, from the integrations the dialog lists. */
  const chooseIntegration = (integrationId: string) =>
    Option.match(model.adding, {
      onNone: () => ({ model }),
      onSome: (adding) =>
        Adding.matchOrElse(
          adding,
          {
            Choosing: ({ capability }) =>
              Option.match(
                Option.fromUndefinedOr(integrationsToAdd(model, capability).find(({ id }) => id === integrationId)),
                {
                  onNone: () => ({ model }),
                  onSome: (integration) =>
                    Update.combine(
                      modifyFields(model, { adding: () => Option.some(startConfiguring(integration, capability)) }),
                      [focusField("add-connection-name")]
                    )
                }
              )
          },
          () => ({ model })
        )
    })

  /**
   * Go back from the form that adds a connection to the integrations it was chosen among, unless its request was sent.
   */
  const goBack = () =>
    Option.match(configuringOf(model), {
      onNone: () => ({ model }),
      onSome: ({ capability, creating }) =>
        Option.isSome(creating)
          ? { model }
          : Update.combine(
              modifyFields(model, { adding: () => Option.some(Adding.Choosing({ capability, query: "" })) }),
              [focusField("search-integrations")]
            )
    })

  /** What follows the store keeping the action `written`: what the person entered for it is done with. */
  const keep = (written: Written) =>
    Written.match(written, {
      Rename: ({ connectionId }) => ({
        model: keepEdit(model, connectionId, (edit) =>
          modifyFields(edit, { name: () => Option.none(), saving: () => Option.none(), failure: () => Option.none() })
        ),
        outMessage: OutMessage.SavedName()
      }),
      Configure: ({ connectionId }) => ({
        model: keepEdit(model, connectionId, (edit) =>
          modifyFields(edit, {
            settings: () => Option.none(),
            saving: () => Option.none(),
            failure: () => Option.none()
          })
        ),
        outMessage: OutMessage.SavedSettings()
      }),
      Remove: ({ connectionId }) =>
        Option.match(
          Option.filter(model.removing, (removing) => removing.connectionId === connectionId),
          {
            onNone: () => ({ model }),
            onSome: ({ name }) =>
              pipe(
                Update.combine(modifyFields(model, { notice: () => Option.none() }), [closeDialog]),
                Update.withOutMessage(OutMessage.RemovedConnection({ name }))
              )
          }
        )
    })

  return Message.match(message, {
    ReceivedConnections: ({ connections }) => {
      const sorted = connections.toSorted(byName)
      const isListed = (connectionId: ConnectionContract.ConnectionId) =>
        sorted.some(({ connection }) => connection.id === connectionId)
      const received = modifyFields(model, {
        connections: () => sorted,
        isLoaded: () => true,
        // What the person changed on the page of a connection no longer there, as one removed, and its check, go.
        edits: (edits) => edits.filter(({ connectionId }) => isListed(connectionId)),
        checks: (checks) => checks.filter(({ connectionId }) => isListed(connectionId))
      })
      return Option.isSome(configuringOf(received)) ? finishAdding(received) : closeDialogOfGoneConnection(received)
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
      model: modifyFields(withoutDialogFailures(model), {
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
    ClickedAdd: ({ capability }) => askToAdd(capability),
    TypedIntegrationQuery: ({ query }) => ({
      model: atAdding(model, (adding) =>
        Adding.matchOrElse(adding, { Choosing: (choosing) => Adding.Choosing({ ...choosing, query }) }, () => adding)
      )
    }),
    ChoseIntegration: ({ integrationId }) => chooseIntegration(integrationId),
    ClickedBack: goBack,
    TypedAddingName: ({ name }) => ({ model: atDraft(model, (configuring) => ({ ...configuring, name })) }),
    ChangedAddingSetting: ({ name, value }) => ({
      model: atDraft(model, (configuring) => ({
        ...configuring,
        settings: { ...configuring.settings, [name]: value }
      }))
    }),
    ChoseAuth: ({ auth }) => ({ model: atDraft(model, (configuring) => ({ ...configuring, auth })) }),
    TypedApiKey: ({ apiKey }) => ({ model: atDraft(model, (configuring) => ({ ...configuring, apiKey })) }),
    SubmittedAdding: () =>
      Option.match(configuringOf(model), {
        onNone: () => ({ model }),
        onSome: (configuring) => submitAdding(model, configuring)
      }),
    // The host made it: the dialog stays on the connection until the store lists it.
    AddedConnection: ({ connectionId }) =>
      finishAdding(
        modifyFields(model, {
          adding: Option.map((adding) =>
            Adding.matchOrElse(
              adding,
              {
                Configuring: (configuring) =>
                  Adding.Configuring({
                    ...configuring,
                    creating: Option.map(configuring.creating, (creating) => ({
                      ...creating,
                      connectionId: Option.some(connectionId)
                    }))
                  })
              },
              () => adding
            )
          )
        })
      ),
    FailedAddConnection: ({ key, failure }) => ({
      model: atConfiguring(model, (configuring) =>
        modifyFields(configuring, {
          key: () => key,
          failure: () => Option.some(failure),
          creating: () => Option.none()
        })
      )
    }),
    ClickedReplaceKey: ({ connectionId }) => askToReplaceKey(connectionId),
    TypedNewKey: ({ apiKey }) => ({
      model: modifyFields(model, {
        replacing: Option.map((replacing) =>
          replacing.isSending
            ? replacing
            : modifyFields(replacing, { apiKey: () => apiKey, failure: () => Option.none() })
        )
      })
    }),
    SubmittedNewKey: () => submitNewKey(model),
    ReplacedConnectionKey: ({ connectionId }) =>
      Option.exists(model.replacing, (replacing) => replacing.connectionId === connectionId)
        ? pipe(
            Update.combine(modifyFields(model, { notice: () => Option.none() }), [closeDialog]),
            Update.withOutMessage(OutMessage.ReplacedKey())
          )
        : { model },
    FailedReplaceConnectionKey: ({ connectionId, failure }) => ({
      model: modifyFields(model, {
        replacing: Option.map((replacing) =>
          replacing.connectionId === connectionId
            ? modifyFields(replacing, { isSending: () => false, failure: () => Option.some(failure) })
            : replacing
        )
      })
    }),
    ClickedRemove: ({ connectionId }) => askToRemove(connectionId),
    ConfirmedRemoval: () => submitRemoval(model),
    CompletedFocusField: () => ({ model }),
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
    ClickedCheck: ({ connectionId }) => Update.combine(model, [checkStep(connectionId)]),
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
