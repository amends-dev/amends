import type { Connection as ConnectionContract } from "@amends-dev/connection"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import { modifyFields } from "foldkit/struct"
import * as SettingsForm from "../../settingsForm.ts"
import {
  AddConnection,
  CheckConnection,
  ConfigureConnection,
  RemoveConnection,
  RenameConnection,
  ReplaceConnectionKey
} from "./command.ts"
import { ConnectionsComposition } from "./composition.ts"
import {
  Check,
  type CheckItem,
  findConnection,
  findIntegration,
  Form,
  Integrations,
  Message,
  type Model,
  OutMessage
} from "./definition.ts"

/** The model with the form open as `change` makes it, while one is open. */
const atForm = (model: Model, change: (form: Form) => Form): Model => modifyFields(model, { form: Option.map(change) })

/** `form` with why it was refused, no longer sending. */
const refused = (form: Form, error: string): Form =>
  Form.match(form, {
    Adding: (adding) => Form.Adding({ ...adding, sending: false, error: Option.some(error) }),
    Renaming: (renaming) => renaming,
    Configuring: (configuring) => Form.Configuring({ ...configuring, error: Option.some(error) }),
    ReplacingKey: (replacing) => Form.ReplacingKey({ ...replacing, sending: false, error: Option.some(error) })
  })

/** `checks` with the check of `connectionId` as `check`, if it has one. */
const finishCheck = (
  checks: ReadonlyArray<CheckItem>,
  connectionId: ConnectionContract.ConnectionId,
  check: Check
): ReadonlyArray<CheckItem> =>
  checks.map((item) => (item.connectionId === connectionId ? { connectionId, check } : item))

/** `checks` with a check of `connectionId` under way in place of the last one. */
const startCheck = (
  checks: ReadonlyArray<CheckItem>,
  connectionId: ConnectionContract.ConnectionId
): ReadonlyArray<CheckItem> => [
  ...checks.filter((item) => item.connectionId !== connectionId),
  { connectionId, check: Check.Checking() }
]

/** Send the form open: over HTTP for what carries a key or makes a connection, as an action otherwise. */
const submitForm = (model: Model, form: Form) => {
  const { workspaceId, memberId } = model
  const closed = modifyFields(model, { form: () => Option.none() })
  const refusing = (error: string) => ({
    model: modifyFields(model, { form: () => Option.some(refused(form, error)) })
  })
  return Form.match(form, {
    Adding: (adding) =>
      adding.sending
        ? { model }
        : Option.match(findIntegration(model, adding.integrationId), {
            onNone: () => refusing("Choose an integration."),
            onSome: (integration) =>
              Result.match(SettingsForm.settingsOf(integration.settings, adding.settings), {
                onFailure: refusing,
                onSuccess: (settings) => ({
                  model: modifyFields(model, {
                    form: () => Option.some(Form.Adding({ ...adding, sending: true, error: Option.none() }))
                  }),
                  commands: [
                    AddConnection({
                      workspaceId,
                      integration: integration.id,
                      name: adding.name,
                      auth: adding.auth,
                      apiKey: adding.apiKey,
                      settings
                    })
                  ]
                })
              })
          }),
    Renaming: ({ connectionId, name }) =>
      Option.match(findConnection(model, connectionId), {
        onNone: () => ({ model: closed }),
        onSome: ({ connection }) => ({
          model: closed,
          commands: [RenameConnection({ workspaceId, memberId, connectionId, name, expectedName: connection.name })]
        })
      }),
    Configuring: ({ connectionId, settings: draft }) =>
      Option.match(
        Option.flatMap(findConnection(model, connectionId), ({ connection }) =>
          findIntegration(model, connection.integration)
        ),
        {
          onNone: () => ({ model: closed }),
          onSome: (integration) =>
            Result.match(SettingsForm.settingsOf(integration.settings, draft), {
              onFailure: refusing,
              onSuccess: (settings) => ({
                model: closed,
                commands: [ConfigureConnection({ workspaceId, memberId, connectionId, settings })]
              })
            })
        }
      ),
    ReplacingKey: (replacing) =>
      replacing.sending
        ? { model }
        : {
            model: modifyFields(model, {
              form: () => Option.some(Form.ReplacingKey({ ...replacing, sending: true, error: Option.none() }))
            }),
            commands: [
              ReplaceConnectionKey({ workspaceId, connectionId: replacing.connectionId, apiKey: replacing.apiKey })
            ]
          }
  })
}

export const update = ConnectionsComposition.makeUpdate((model, message) => {
  const { workspaceId, memberId } = model
  return Message.match(message, {
    ReceivedConnections: ({ connections }) => {
      const isListed = (connectionId: ConnectionContract.ConnectionId) =>
        connections.some(({ connection }) => connection.id === connectionId)
      return {
        model: modifyFields(model, {
          connections: () => connections,
          isLoaded: () => true,
          // A form about a connection no longer there, as one removed, closes, and its check goes.
          form: Option.filter((form) =>
            Form.matchOrElse(
              form,
              {
                Renaming: ({ connectionId }) => isListed(connectionId),
                Configuring: ({ connectionId }) => isListed(connectionId),
                ReplacingKey: ({ connectionId }) => isListed(connectionId)
              },
              () => true
            )
          ),
          checks: (checks) => checks.filter(({ connectionId }) => isListed(connectionId))
        })
      }
    },
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
    ClickedBrowse: () => ({ model, outMessage: OutMessage.RequestedBrowse() }),
    ClickedConnection: ({ connectionId }) => ({ model, outMessage: OutMessage.OpenedConnection({ connectionId }) }),
    ClickedBrowseChannels: () => ({ model, outMessage: OutMessage.RequestedChannels() }),
    ClickedAdd: () => ({
      outMessage: OutMessage.RequestedBrowse(),
      model: modifyFields(model, {
        form: () =>
          Option.some(
            Form.Adding({
              integrationId: "",
              name: "",
              auth: "none",
              apiKey: "",
              settings: {},
              sending: false,
              error: Option.none()
            })
          )
      })
    }),
    ChoseIntegration: ({ integrationId }) => ({
      model: atForm(model, (form) =>
        Form.matchOrElse(
          form,
          {
            Adding: (adding) =>
              Option.match(findIntegration(model, integrationId), {
                onNone: () => Form.Adding({ ...adding, integrationId }),
                onSome: (integration) =>
                  Form.Adding({
                    ...adding,
                    integrationId,
                    name: adding.name === "" ? integration.name : adding.name,
                    auth: integration.auth[0],
                    settings: SettingsForm.draftOf(integration.settings),
                    error: Option.none()
                  })
              })
          },
          () => form
        )
      )
    }),
    TypedName: ({ name }) => ({
      model: atForm(model, (form) =>
        Form.matchOrElse(
          form,
          {
            Adding: (adding) => Form.Adding({ ...adding, name }),
            Renaming: (renaming) => Form.Renaming({ ...renaming, name })
          },
          () => form
        )
      )
    }),
    ChoseAuth: ({ auth }) => ({
      model: atForm(model, (form) =>
        Form.matchOrElse(form, { Adding: (adding) => Form.Adding({ ...adding, auth }) }, () => form)
      )
    }),
    TypedApiKey: ({ apiKey }) => ({
      model: atForm(model, (form) =>
        Form.matchOrElse(
          form,
          {
            Adding: (adding) => Form.Adding({ ...adding, apiKey }),
            ReplacingKey: (replacing) => Form.ReplacingKey({ ...replacing, apiKey })
          },
          () => form
        )
      )
    }),
    ChangedSetting: ({ name, value }) => ({
      model: atForm(model, (form) =>
        Form.matchOrElse(
          form,
          {
            Adding: (adding) => Form.Adding({ ...adding, settings: { ...adding.settings, [name]: value } }),
            Configuring: (configuring) =>
              Form.Configuring({ ...configuring, settings: { ...configuring.settings, [name]: value } })
          },
          () => form
        )
      )
    }),
    SubmittedForm: () =>
      Option.match(model.form, { onNone: () => ({ model }), onSome: (form) => submitForm(model, form) }),
    ClickedCancelForm: () => ({ model: modifyFields(model, { form: () => Option.none() }) }),
    AddedConnection: () => ({
      model: modifyFields(model, { form: Option.filter((form) => !Form.isAnyOf(["Adding"])(form)) })
    }),
    FailedAddConnection: ({ error }) => ({
      model: atForm(model, (form) => (Form.isAnyOf(["Adding"])(form) ? refused(form, error) : form))
    }),
    ClickedRename: ({ connectionId }) => ({
      model: modifyFields(model, {
        form: () =>
          Option.map(findConnection(model, connectionId), ({ connection }) =>
            Form.Renaming({ connectionId, name: connection.name })
          )
      })
    }),
    ClickedConfigure: ({ connectionId }) => ({
      model: modifyFields(model, {
        form: () =>
          Option.flatMap(findConnection(model, connectionId), ({ connection }) =>
            Option.map(findIntegration(model, connection.integration), (integration) =>
              Form.Configuring({
                connectionId,
                settings: SettingsForm.draftOf(integration.settings, connection.settings),
                error: Option.none()
              })
            )
          )
      })
    }),
    ClickedReplaceKey: ({ connectionId }) => ({
      model: modifyFields(model, {
        form: () => Option.some(Form.ReplacingKey({ connectionId, apiKey: "", sending: false, error: Option.none() }))
      })
    }),
    ReplacedKey: () => ({
      model: modifyFields(model, { form: Option.filter((form) => !Form.isAnyOf(["ReplacingKey"])(form)) })
    }),
    FailedReplaceKey: ({ error }) => ({
      model: atForm(model, (form) => (Form.isAnyOf(["ReplacingKey"])(form) ? refused(form, error) : form))
    }),
    ClickedCheck: ({ connectionId }) => ({
      model: modifyFields(model, { checks: (checks) => startCheck(checks, connectionId) }),
      commands: [CheckConnection({ workspaceId, connectionId })]
    }),
    CheckedConnection: ({ connectionId, health }) => ({
      model: modifyFields(model, { checks: (checks) => finishCheck(checks, connectionId, Check.Checked({ health })) })
    }),
    FailedCheckConnection: ({ connectionId, error }) => ({
      model: modifyFields(model, { checks: (checks) => finishCheck(checks, connectionId, Check.Failed({ error })) })
    }),
    ClickedRemove: ({ connectionId }) => ({
      model,
      commands: [RemoveConnection({ workspaceId, memberId, connectionId })]
    }),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
})
