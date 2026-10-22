/** Incoming connection facts, dialog coordination, and message routing. */

import type { Connection as ConnectionContract, Integration } from "@amends-dev/connection"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { findConnection, Integrations } from "../../data/connections.ts"
import { FocusField } from "./command.ts"
import { ConnectionsComposition, DialogBinding, leaveDialog } from "./composition.ts"
import {
  Adding,
  byName,
  Check,
  configuringOf,
  ConnectionsDefinition,
  integrationsToAdd,
  mayAdd,
  mayManage,
  Message,
  type Model,
  OutMessage,
  settingsDraftOf,
  startConfiguring,
  Written
} from "./definition.ts"
import { withCheck, checkStep } from "./update/checks.ts"
import {
  atEdit,
  unlessAbout,
  atAdding,
  atConfiguring,
  atDraft,
  completeEdit,
  refuse,
  withoutDialogFailures
} from "./update/forms.ts"
import { submitAdding, submitName, submitSettings, submitNewKey, submitRemoval } from "./update/submission.ts"

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
        model: completeEdit(model, connectionId, "name"),
        outMessage: OutMessage.SavedName()
      }),
      Configure: ({ connectionId }) => ({
        model: completeEdit(model, connectionId, "settings"),
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
      model: modifyFields(model, { browse: () => ({ tab, query: "" }) }),
      outMessage: OutMessage.RequestedBrowse()
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
